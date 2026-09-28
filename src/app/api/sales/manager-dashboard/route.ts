import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { computePercentChange, timeAgo } from "@/lib/admin/dashboard-helpers";
import { resolveAchievedRevenue } from "@/lib/campaign-revenue-metrics";
import {
  enrichCampaignAllocationFields,
  MIS_DELIVERED_ACHIEVED_OPTIONS,
} from "@/lib/campaign-allocation";
import { aggregateTlLeadCountsByCampaign } from "@/lib/tl/dashboard-leads";


export const dynamic = "force-dynamic";

type Trend = "up" | "down" | "neutral";

function normalizeRoleName(name: string | null | undefined) {
  return (name ?? "").toLowerCase().trim().replace(/\s+/g, "_");
}

const SALES_TEAM_ROLES = new Set(["sales", "sales_manager"]);

function parseDealValue(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrencyShort(num: number) {
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${Math.round(num / 1_000)}K`;
  return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatCurrency(num: number) {
  return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function shortRepName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 8);
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function shortCampaignName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Campaign";
  return trimmed.length > 14 ? `${trimmed.slice(0, 12)}…` : trimmed;
}

async function requireSalesManager() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => normalizeRoleName(r.roles?.name))
    .filter(Boolean);

  const isManagerOrAdmin = roleNames.includes("sales_manager") || roleNames.includes("admin");
  if (!isManagerOrAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  const admin = getAdminClientSafe();
  if (!admin) {
    return { error: NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 }) };
  }

  return { user, orgId, admin };
}

async function fetchSalesTeamUserIds(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  orgId: string
) {
  const { data: orgRoles } = await admin.from("roles").select("id, name").eq("organization_id", orgId);
  const salesRoleIds = ((orgRoles ?? []) as { id: string; name: string | null }[])
    .filter((r) => SALES_TEAM_ROLES.has(normalizeRoleName(r.name)))
    .map((r) => r.id);

  if (salesRoleIds.length === 0)
    return {
      userIds: [] as string[],
      users: [] as {
        id: string;
        full_name: string | null;
        email: string | null;
        status: string;
        created_at: string;
      }[],
    };

  const { data: urRows } = await admin.from("user_roles").select("user_id").in("role_id", salesRoleIds);
  const userIds = [...new Set(((urRows ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  if (userIds.length === 0) return { userIds: [], users: [] };

  const { data: userRows } = await admin
    .from("users")
    .select("id, full_name, email, status, created_at")
    .eq("organization_id", orgId)
    .in("id", userIds)
    .eq("status", "active");

  const users = (userRows ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
    status: string;
    created_at: string;
  }[];

  return { userIds: users.map((u) => u.id), users };
}

export async function GET(request: Request) {
  try {
    const ctx = await requireSalesManager();
    if ("error" in ctx) return ctx.error;

    const { orgId, admin } = ctx;
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("start_date");
    const endDateParam = searchParams.get("end_date");

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const rangeStart = startDateParam ? new Date(`${startDateParam}T00:00:00`) : startMonth;
    const rangeEndExclusive = endDateParam
      ? new Date(`${endDateParam}T00:00:00`)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    if (endDateParam) {
      rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 1);
    }

    const inSelectedRange = (iso: string | null | undefined) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d >= rangeStart && d < rangeEndExclusive;
    };

    /**
     * Campaign belongs to the selected dates when its start_date
     * (fallback: created_at) falls inside the picker range — not mere overlap.
     */
    const campaignInSelectedDates = (c: {
      start_date: string | null;
      end_date: string | null;
      created_at: string | null;
    }) => {
      const dateIso = c.start_date || c.created_at;
      if (!dateIso) return false;
      const d = c.start_date
        ? new Date(`${String(c.start_date).slice(0, 10)}T00:00:00`)
        : new Date(dateIso);
      return d >= rangeStart && d < rangeEndExclusive;
    };

    const { userIds: teamUserIds, users: teamUsers } = await fetchSalesTeamUserIds(admin, orgId);

    // ── Campaigns (org-wide totals + earned revenue) ────────────────────────
    const { data: campaignRows } = await admin
      .from("campaigns")
      .select("id, name, status, cpl, achieved, total_allocation, created_at, start_date, end_date")
      .eq("organization_id", orgId);

    const rawCampaigns = (campaignRows ?? []) as {
      id: string;
      name: string | null;
      status: string | null;
      cpl: number | null;
      achieved: number | null;
      total_allocation: number | null;
      created_at: string | null;
      start_date: string | null;
      end_date: string | null;
    }[];

    // Live achieved = MIS-delivered leads (same as Campaigns page)
    const leadCountsByCampaign = await aggregateTlLeadCountsByCampaign(
      admin,
      orgId,
      rawCampaigns.map((c) => c.id)
    );

    const campaigns = rawCampaigns.map((c) => {
      const counts = leadCountsByCampaign[c.id];
      const enriched = enrichCampaignAllocationFields(
        c,
        {
          total: counts?.total ?? 0,
          qualified: counts?.qualified ?? 0,
          delivered: counts?.delivered ?? 0,
        },
        MIS_DELIVERED_ACHIEVED_OPTIONS
      );
      const achieved = Number(enriched.achieved ?? 0);
      const revenue = resolveAchievedRevenue(c.cpl, achieved);
      return {
        ...enriched,
        achieved,
        revenue,
      };
    });

    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter(
      (c) => String(c.status ?? "").toLowerCase() === "active"
    ).length;

    const totalRevenue = campaigns.reduce((sum, c) => sum + c.revenue, 0);
    const revenueInRange = campaigns
      .filter(campaignInSelectedDates)
      .reduce((sum, c) => sum + c.revenue, 0);

    // Avg. Conversion = campaign delivery (achieved / allocation), same basis as Latest Campaigns
    const campaignDeliveryRate = (list: typeof campaigns) => {
      let alloc = 0;
      let achieved = 0;
      for (const c of list) {
        const a = Number(c.total_allocation ?? 0);
        if (a <= 0) continue;
        alloc += a;
        achieved += Number(c.achieved ?? 0);
      }
      return alloc > 0 ? (achieved / alloc) * 100 : 0;
    };

    const conversionRate = campaignDeliveryRate(campaigns);
    const conversionInRange = campaignDeliveryRate(
      campaigns.filter(campaignInSelectedDates)
    );

    const rangeMs = Math.max(1, rangeEndExclusive.getTime() - rangeStart.getTime());
    const prevRangeStart = new Date(rangeStart.getTime() - rangeMs);
    const conversionPrevPeriod = campaignDeliveryRate(
      campaigns.filter((c) => {
        const dateIso = c.start_date || c.created_at;
        if (!dateIso) return false;
        const d = c.start_date
          ? new Date(`${String(c.start_date).slice(0, 10)}T00:00:00`)
          : new Date(dateIso);
        return d >= prevRangeStart && d < rangeStart;
      })
    );
    const conversionTrend = computePercentChange(conversionInRange, conversionPrevPeriod);

    // Campaign-wise earned revenue (for trend chart) — by campaign start in selected range
    const campaignRevenueTrend = campaigns
      .filter(campaignInSelectedDates)
      .map((c) => ({
        name: shortCampaignName(c.name || "Campaign"),
        fullName: (c.name || "Campaign").trim() || "Campaign",
        revenue: c.revenue,
      }))
      .filter((c) => c.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // Full campaign-wise revenue table data — by campaign start in selected range
    const campaignRevenueData = campaigns
      .filter(campaignInSelectedDates)
      .map((c) => ({
        key: c.id,
        name: (c.name || "Campaign").trim() || "Campaign",
        status: String(c.status ?? "—"),
        cpl: c.cpl ?? 0,
        achieved: c.achieved,
        revenue: c.revenue,
        revenueLabel: formatCurrency(c.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Campaign Process — progress for campaigns active in the selected date range
    const progressColor = (percent: number) => {
      if (percent >= 100) return "#52c41a"; // green
      if (percent > 50) return "#1677ff"; // blue
      return "#f59e0b"; // amber/orange
    };

    const formatStatusLabel = (status: string | null | undefined) => {
      const s = String(status ?? "—").trim();
      if (!s || s === "—") return "—";
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    };

    const toCampaignProgressRow = (c: (typeof campaigns)[number]) => {
      const allocation = Number(c.total_allocation ?? 0);
      const achieved = Number(c.achieved ?? 0);
      const percent =
        allocation > 0
          ? Math.min(100, Math.round((achieved / allocation) * 100))
          : achieved > 0
            ? 100
            : 0;
      const dateIso = c.start_date || c.created_at;
      const dateLabel = dateIso
        ? new Date(
            c.start_date ? `${String(c.start_date).slice(0, 10)}T00:00:00` : dateIso
          ).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : null;
      return {
        id: c.id,
        name: (c.name || "Campaign").trim() || "Campaign",
        status: formatStatusLabel(c.status),
        achieved,
        allocation,
        percent,
        revenue: c.revenue,
        revenueLabel: formatCurrency(c.revenue),
        color: progressColor(percent),
        dateLabel,
        sortStartMs: dateIso
          ? new Date(
              c.start_date ? `${String(c.start_date).slice(0, 10)}T00:00:00` : dateIso
            ).getTime()
          : 0,
      };
    };

    // Sort by campaign date (newest first) — all campaigns in selected dates
    const datedCampaigns = [...campaigns.filter(campaignInSelectedDates)].sort((a, b) => {
      const ta = a.start_date || a.created_at || "";
      const tb = b.start_date || b.created_at || "";
      return tb.localeCompare(ta);
    });

    const latestCampaigns = datedCampaigns
      .map(toCampaignProgressRow)
      .map(({ sortStartMs: _sortStartMs, ...row }) => row);

    // ── Clients (org-wide total) ────────────────────────────────────────────
    const { count: totalClientsCount } = await admin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);

    const totalClients = totalClientsCount ?? 0;

    // ── Deals (org users) ───────────────────────────────────────────────────
    const { data: orgUserRows } = await admin
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId);
    const orgUsers = (orgUserRows ?? []) as {
      id: string;
      full_name: string | null;
      email: string | null;
    }[];
    const orgUserIds = orgUsers.map((u) => u.id);
    const orgUserNameById = Object.fromEntries(
      orgUsers.map((u) => [u.id, u.full_name || u.email || "Unknown"])
    );

    let deals: Array<{
      id: string;
      value: number | null;
      stage: string;
      owner_id: string | null;
      created_at: string;
      deal_name: string | null;
    }> = [];

    if (orgUserIds.length > 0) {
      const { data: dealRows } = await admin
        .from("deals")
        .select("id, value, stage, owner_id, created_at, deal_name")
        .in("owner_id", orgUserIds);
      deals = (dealRows ?? []) as typeof deals;
    }

    const isInMonth = (iso: string, start: Date, end: Date) => {
      const d = new Date(iso);
      return d >= start && d < end;
    };

    // ── Sales leads (org-wide conversion) ───────────────────────────────────
    const { data: allLeads } = await admin
      .from("sales_leads")
      .select("id, status, converted, assigned_agent_id, created_by, budget, created_at")
      .eq("organization_id", orgId);

    const leads = (allLeads ?? []) as Array<{
      id: string;
      status: string | null;
      converted: boolean | null;
      assigned_agent_id: string | null;
      created_by: string | null;
      budget: string | null;
      created_at: string | null;
    }>;

    // ── Per-rep stats (selected date range + activity fallback) ─────────────
    type RepBucket = {
      id: string;
      name: string;
      dealsAll: number;
      revenueAll: number;
      dealsRange: number;
      revenueRange: number;
      dealsPrevMonth: number;
      totalLeads: number;
      leadsRange: number;
      convertedLeads: number;
      convertedRange: number;
      activitiesAll: number;
      activitiesRange: number;
    };

    const repMap = new Map<string, RepBucket>();
    const ensureRep = (id: string, name: string) => {
      if (!repMap.has(id)) {
        repMap.set(id, {
          id,
          name,
          dealsAll: 0,
          revenueAll: 0,
          dealsRange: 0,
          revenueRange: 0,
          dealsPrevMonth: 0,
          totalLeads: 0,
          leadsRange: 0,
          convertedLeads: 0,
          convertedRange: 0,
          activitiesAll: 0,
          activitiesRange: 0,
        });
      } else if (name !== "Unknown" && repMap.get(id)!.name === "Unknown") {
        repMap.get(id)!.name = name;
      }
      return repMap.get(id)!;
    };

    for (const u of teamUsers) {
      ensureRep(u.id, u.full_name || u.email || "Unknown");
    }

    for (const deal of deals) {
      if (!deal.owner_id) continue;
      const rep = ensureRep(deal.owner_id, orgUserNameById[deal.owner_id] || "Unknown");
      const val = parseDealValue(deal.value);
      if (String(deal.stage).toLowerCase() === "closed_won") {
        rep.dealsAll += 1;
        rep.revenueAll += val;
      }
      if (inSelectedRange(deal.created_at)) {
        rep.dealsRange += 1;
        rep.revenueRange += val;
      }
      if (isInMonth(deal.created_at, startPrevMonth, startMonth)) {
        rep.dealsPrevMonth += 1;
      }
    }

    for (const lead of leads) {
      const ownerId = lead.assigned_agent_id || lead.created_by;
      if (!ownerId) continue;
      const rep = ensureRep(ownerId, orgUserNameById[ownerId] || "Unknown");
      rep.totalLeads += 1;
      if (lead.converted) rep.convertedLeads += 1;
      if (inSelectedRange(lead.created_at)) {
        rep.leadsRange += 1;
        if (lead.converted) rep.convertedRange += 1;
      }
    }

    // Activities are what "Recent Team Activity" already shows — count them for reps
    let activityCountQuery = admin
      .from("activities")
      .select("owner_id, activity_date, created_at")
      .order("activity_date", { ascending: false })
      .limit(2000);
    if (teamUserIds.length > 0) {
      activityCountQuery = activityCountQuery.in("owner_id", teamUserIds);
    } else if (orgUserIds.length > 0) {
      activityCountQuery = activityCountQuery.in("owner_id", orgUserIds);
    }
    const { data: activityCountRows } = await activityCountQuery;
    for (const a of (activityCountRows ?? []) as Array<{
      owner_id: string | null;
      activity_date: string | null;
      created_at: string | null;
    }>) {
      if (!a.owner_id) continue;
      const rep = ensureRep(a.owner_id, orgUserNameById[a.owner_id] || "Unknown");
      rep.activitiesAll += 1;
      if (inSelectedRange(a.activity_date ?? a.created_at)) {
        rep.activitiesRange += 1;
      }
    }

    // Backfill remaining unknown names
    const unknownOwnerIds = [...repMap.values()]
      .filter((r) => r.name === "Unknown")
      .map((r) => r.id);
    if (unknownOwnerIds.length > 0) {
      const { data: ownerRows } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", unknownOwnerIds);
      for (const u of (ownerRows ?? []) as {
        id: string;
        full_name: string | null;
        email: string | null;
      }[]) {
        const rep = repMap.get(u.id);
        if (rep) rep.name = u.full_name || u.email || "Unknown";
      }
    }

    const repList = [...repMap.values()];

    const mapRepChartRow = (r: RepBucket, useRange: boolean) => ({
      name: shortRepName(r.name),
      leads: useRange ? r.leadsRange : r.totalLeads,
      deals: useRange ? r.dealsRange : r.dealsAll,
      // Use activities when deals are sparse so the chart still has bars
      activities: useRange ? r.activitiesRange : r.activitiesAll,
      revenue: Math.round((useRange ? r.revenueRange : r.revenueAll) / 1000),
    });

    const hasRangeActivity = (r: RepBucket) =>
      r.dealsRange > 0 || r.revenueRange > 0 || r.leadsRange > 0 || r.activitiesRange > 0;
    const hasAnyActivity = (r: RepBucket) =>
      r.totalLeads > 0 || r.dealsAll > 0 || r.revenueAll > 0 || r.activitiesAll > 0;

    const repPerformanceInRange = repList
      .filter(hasRangeActivity)
      .sort(
        (a, b) =>
          b.leadsRange + b.dealsRange + b.activitiesRange -
          (a.leadsRange + a.dealsRange + a.activitiesRange)
      )
      .slice(0, 8)
      .map((r) => mapRepChartRow(r, true));

    // Fallback: overall stats when selected range has no deals/leads/activities
    const repPerformanceData =
      repPerformanceInRange.length > 0
        ? repPerformanceInRange
        : repList
            .filter(hasAnyActivity)
            .sort(
              (a, b) =>
                b.totalLeads + b.dealsAll + b.activitiesAll -
                (a.totalLeads + a.dealsAll + a.activitiesAll)
            )
            .slice(0, 8)
            .map((r) => mapRepChartRow(r, false));

    const teamMembers = repList
      .filter(hasAnyActivity)
      .sort((a, b) => b.revenueAll + b.totalLeads - (a.revenueAll + a.totalLeads))
      .slice(0, 10)
      .map((r) => {
        const conversion = r.totalLeads > 0 ? Math.round((r.convertedLeads / r.totalLeads) * 100) : 0;
        const trend: Trend =
          r.dealsRange > r.dealsPrevMonth ? "up" : r.dealsRange < r.dealsPrevMonth ? "down" : "neutral";
        return {
          key: r.id,
          name: r.name,
          deals: r.dealsAll || r.dealsRange || r.activitiesAll,
          revenue: formatCurrency(r.revenueAll || r.revenueRange),
          conversion,
          trend,
          status: "active",
        };
      });

    // ── Recent team activity ────────────────────────────────────────────────
    let activityQuery = admin
      .from("activities")
      .select("id, activity_type, related_to_type, related_to_id, notes, activity_date, owner_id, created_at")
      .order("activity_date", { ascending: false })
      .limit(8);

    if (teamUserIds.length > 0) {
      activityQuery = activityQuery.in("owner_id", teamUserIds);
    }

    const { data: activityRows } = await activityQuery;
    const activityList = (activityRows ?? []) as Array<{
      id: string;
      activity_type: string;
      related_to_type: string | null;
      related_to_id: string | null;
      notes: string | null;
      activity_date: string | null;
      owner_id: string | null;
      created_at: string | null;
    }>;

    const ownerNames: Record<string, string> = {};
    teamUsers.forEach((u) => {
      ownerNames[u.id] = u.full_name || u.email || "Unknown";
    });

    const leadIds = [
      ...new Set(
        activityList.filter((a) => a.related_to_type === "lead").map((a) => a.related_to_id).filter(Boolean)
      ),
    ] as string[];
    const dealIds = [
      ...new Set(
        activityList.filter((a) => a.related_to_type === "deal").map((a) => a.related_to_id).filter(Boolean)
      ),
    ] as string[];

    let leadNames: Record<string, string> = {};
    let leadBudgets: Record<string, number> = {};
    if (leadIds.length > 0) {
      const { data: leadRows } = await admin
        .from("sales_leads")
        .select("id, lead_name, first_name, last_name, budget")
        .in("id", leadIds);
      (leadRows ?? []).forEach((r: Record<string, unknown>) => {
        const id = r.id as string;
        leadNames[id] =
          (r.lead_name as string) ||
          [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
          "Lead";
        const budgetRaw = r.budget as string | null;
        const budgetNum = budgetRaw ? Number(String(budgetRaw).replace(/[^0-9.]/g, "")) : NaN;
        if (Number.isFinite(budgetNum)) leadBudgets[id] = budgetNum;
      });
    }

    let dealMeta: Record<string, { name: string; value: number }> = {};
    if (dealIds.length > 0) {
      const { data: dealRows } = await admin
        .from("deals")
        .select("id, deal_name, value")
        .in("id", dealIds);
      (dealRows ?? []).forEach((r: Record<string, unknown>) => {
        dealMeta[r.id as string] = {
          name: (r.deal_name as string) || "Deal",
          value: parseDealValue(r.value),
        };
      });
    }

    const actionForType = (activityType: string) => {
      const t = activityType.toLowerCase();
      if (t === "note") return "added a note for";
      if (t === "call") return "logged a call with";
      if (t === "email") return "sent an email to";
      if (t === "meeting") return "scheduled a meeting with";
      if (t === "task") return "created a task for";
      if (t === "lifecycle_change") return "updated status for";
      return "updated record";
    };

    const recentActivities = activityList.map((a) => {
      const userName = a.owner_id ? ownerNames[a.owner_id] ?? "Unknown" : "Unknown";
      const relId = a.related_to_id;
      let target = "—";
      let value = "—";

      if (a.related_to_type === "lead" && relId) {
        target = leadNames[relId] ?? "Lead";
        if (leadBudgets[relId]) value = formatCurrency(leadBudgets[relId]);
      } else if (a.related_to_type === "deal" && relId) {
        target = dealMeta[relId]?.name ?? "Deal";
        if (dealMeta[relId]?.value) value = formatCurrency(dealMeta[relId].value);
      }

      const iso = a.activity_date ?? a.created_at ?? new Date().toISOString();
      return {
        id: a.id,
        user: shortRepName(userName),
        action: actionForType(a.activity_type ?? ""),
        target,
        value,
        time: timeAgo(iso),
        type: a.activity_type === "lifecycle_change" ? "success" : "default",
      };
    });

    return NextResponse.json({
      stats: {
        campaigns: {
          value: String(totalCampaigns),
          change:
            activeCampaigns > 0 ? `${activeCampaigns} Active` : "No active campaigns",
          trend: activeCampaigns > 0 ? "up" : "neutral",
        },
        clients: {
          value: String(totalClients),
          change: "Total clients",
          trend: totalClients > 0 ? "up" : "neutral",
        },
        teamRevenue: {
          value: formatCurrencyShort(totalRevenue),
          change: `In range: ${formatCurrencyShort(revenueInRange)}`,
          trend: revenueInRange > 0 ? "up" : "neutral",
        },
        avgConversion: {
          value: `${conversionRate.toFixed(1)}%`,
          change:
            conversionPrevPeriod > 0 || conversionInRange > 0
              ? `${conversionTrend.changeText} vs prior period`
              : `In range: ${conversionInRange.toFixed(1)}%`,
          trend:
            conversionPrevPeriod > 0 || conversionInRange > 0
              ? conversionTrend.trend
              : conversionInRange > 0
                ? "up"
                : "neutral",
        },
      },
      campaignRevenueTrend,
      campaignRevenueData,
      latestCampaigns,
      repPerformanceData,
      recentActivities,
      teamMembers,
    });
  } catch (err) {
    console.error("Sales manager dashboard GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}