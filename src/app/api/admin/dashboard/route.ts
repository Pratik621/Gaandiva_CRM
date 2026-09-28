import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import {
  buildMisDashboardAggregates,
  fetchMisDashboardLeads,
} from "@/lib/mis/dashboard-stats";
import { LEAD_STATUS_OPTIONS } from "@/constants/salesLeadForm";
import {
  addDays,
  computePercentChange,
  formatStatusLabel,
  ROLE_CHART_COLORS,
  timeAgo,
} from "@/lib/admin/dashboard-helpers";

export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  campaign_code: string | null;
  created_at: string;
};

async function requireAdminOrg() {
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

  const isAdmin = (roleRows ?? []).some(
    (r: { roles: { name: string } | null }) => r.roles?.name?.toLowerCase() === "admin"
  );
  if (!isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 }) };
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

export async function GET() {
  try {
    const ctx = await requireAdminOrg();
    if ("error" in ctx) return ctx.error;

    const { orgId, admin } = ctx;
    const now = new Date();
    const start30 = addDays(now, -30);
    const start60 = addDays(now, -60);
    const start24 = addDays(now, -1);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // ── Users & roles ──────────────────────────────────────────────────────
    const [usersRes, rolesRes, clientsRes, campaignsRes] = await Promise.all([
      admin
        .from("users")
        .select("id, full_name, email, status, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
      admin.from("roles").select("id, name").eq("organization_id", orgId),
      admin.from("clients").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      admin
        .from("campaigns")
        .select("id, name, status, campaign_code, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
    ]);

    if (usersRes.error) {
      return NextResponse.json({ error: usersRes.error.message }, { status: 500 });
    }
    if (campaignsRes.error) {
      return NextResponse.json({ error: campaignsRes.error.message }, { status: 500 });
    }

    type UserRow = {
      id: string;
      full_name: string | null;
      email: string | null;
      status: string;
      created_at: string;
    };
    const users = (usersRes.data ?? []) as UserRow[];
    const userIds = users.map((u) => u.id);
    const roles = (rolesRes.data ?? []) as { id: string; name: string }[];
    const campaigns = (campaignsRes.data ?? []) as CampaignRow[];
    const campaignIds = campaigns.map((c) => c.id);

    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.status === "active").length;
    const usersThisMonth = users.filter((u) => new Date(u.created_at) >= startMonth).length;
    const usersPrevMonth = users.filter((u) => {
      const d = new Date(u.created_at);
      return d >= startPrevMonth && d < startMonth;
    }).length;
    const usersMonthTrend = computePercentChange(usersThisMonth, usersPrevMonth);

    const activeCampaigns = campaigns.filter((c) => {
      const s = String(c.status || "").toLowerCase();
      return s === "active" || s === "running" || s === "in_progress";
    }).length;
    const totalClients = clientsRes.count ?? 0;

    // Role distribution
    let rolesMap: Record<string, string[]> = {};
    if (userIds.length > 0) {
      const { data: urData } = await admin
        .from("user_roles")
        .select("user_id, roles(name)")
        .in("user_id", userIds);
      (urData ?? []).forEach((ur: { user_id: string; roles: { name: string } | null }) => {
        if (ur.roles?.name) {
          if (!rolesMap[ur.user_id]) rolesMap[ur.user_id] = [];
          rolesMap[ur.user_id].push(ur.roles.name);
        }
      });
    }

    const roleCountMap = new Map<string, number>();
    Object.values(rolesMap).forEach((names) => {
      names.forEach((name) => {
        roleCountMap.set(name, (roleCountMap.get(name) ?? 0) + 1);
      });
    });
    const roleDistribution = [...roleCountMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name,
        value,
        color: ROLE_CHART_COLORS[i % ROLE_CHART_COLORS.length],
      }));

    const rolesWithAssignments = roleCountMap.size;

    // ── Ops leads (campaign leads via MIS aggregates) ──────────────────────
    const opsLeads = await fetchMisDashboardLeads(admin, orgId, campaignIds);
    const misAggregates = buildMisDashboardAggregates(
      opsLeads,
      campaigns.map((c) => ({ id: c.id, name: c.name, campaign_code: c.campaign_code }))
    );

    const opsConversion =
      misAggregates.stats.totalLeadsUploaded > 0
        ? (misAggregates.stats.qaApprovedLeads / misAggregates.stats.totalLeadsUploaded) * 100
        : 0;

    // ── Sales CRM leads ────────────────────────────────────────────────────
    const { count: salesLeadsTotal } = await admin
      .from("sales_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);

    const { count: salesConverted } = await admin
      .from("sales_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("converted", true);

    const salesConversion =
      (salesLeadsTotal ?? 0) > 0 ? ((salesConverted ?? 0) / (salesLeadsTotal ?? 1)) * 100 : 0;

    const { count: salesLeads30 } = await admin
      .from("sales_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", start30.toISOString());

    const { count: salesLeadsPrev30 } = await admin
      .from("sales_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", start60.toISOString())
      .lt("created_at", start30.toISOString());

    const salesLeadsTrend = computePercentChange(salesLeads30 ?? 0, salesLeadsPrev30 ?? 0);

    // Sales pipeline (last 30 days)
    const statusOrder = LEAD_STATUS_OPTIONS.map((s) => s.value);
    const statusCounts: Record<string, number> = {};
    for (const v of statusOrder) statusCounts[v] = 0;

    const { data: pipelineLeads } = await admin
      .from("sales_leads")
      .select("status")
      .eq("organization_id", orgId)
      .gte("created_at", start30.toISOString());

    for (const l of pipelineLeads ?? []) {
      const st = ((l as { status: string | null }).status ?? "new") as string;
      statusCounts[st] = (statusCounts[st] ?? 0) + 1;
    }

    const salesPipeline = statusOrder.map((st) => ({
      stage: LEAD_STATUS_OPTIONS.find((o) => o.value === st)?.label ?? st,
      count: statusCounts[st] ?? 0,
    }));

    // ── User growth (last 6 months) ────────────────────────────────────────
    const growthMonths: { month: string; users: number; logins: number; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      growthMonths.push({
        month: start.toLocaleDateString("en-US", { month: "short" }),
        users: 0,
        logins: 0,
        start,
        end,
      });
    }

    for (const u of users) {
      const d = new Date(u.created_at);
      for (const bucket of growthMonths) {
        if (d >= bucket.start && d < bucket.end) {
          bucket.users += 1;
          break;
        }
      }
    }

    if (userIds.length > 0) {
      const oldestMonth = growthMonths[0].start;
      const { data: loginRows } = await admin
        .from("login_logs")
        .select("login_time, user_id")
        .in("user_id", userIds)
        .gte("login_time", oldestMonth.toISOString());

      for (const row of loginRows ?? []) {
        const d = new Date((row as { login_time: string }).login_time);
        for (const bucket of growthMonths) {
          if (d >= bucket.start && d < bucket.end) {
            bucket.logins += 1;
            break;
          }
        }
      }
    }

    const userGrowthData = growthMonths.map(({ month, users: u, logins }) => ({
      month,
      users: u,
      logins,
    }));

    // ── Lead status chart (ops) ────────────────────────────────────────────
    const leadStatusData = misAggregates.leadStatus
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((s) => ({
        status: formatStatusLabel(s.status),
        count: s.count,
      }));

    // ── Daily uploads (14 days) ────────────────────────────────────────────
    const dailyUploads = misAggregates.dailyUploads.map((d) => ({
      date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: d.count,
    }));

    // ── Campaign performance (top 8) ───────────────────────────────────────
    const campaignPerformance = misAggregates.campaignPerformance.slice(0, 8).map((c) => {
      const meta = campaigns.find((x) => x.id === c.id);
      const status = meta?.status ?? "—";
      const qualRate = c.totalLeads > 0 ? Math.round((c.qualifiedLeads / c.totalLeads) * 100) : 0;
      return {
        id: c.id,
        name: c.name,
        code: c.campaign_code,
        status: formatStatusLabel(String(status)),
        totalLeads: c.totalLeads,
        qualifiedLeads: c.qualifiedLeads,
        qualRate,
      };
    });

    // ── Recent users (24h) ───────────────────────────────────────────────
    const recentUsers = users
      .filter((u) => new Date(u.created_at) >= start24)
      .slice(0, 8)
      .map((u) => ({
        id: u.id,
        name: u.full_name || u.email || "Unknown",
        email: u.email ?? "—",
        role: rolesMap[u.id]?.[0] ?? "—",
        status: u.status === "active" ? "Active" : formatStatusLabel(u.status),
        time: timeAgo(u.created_at),
      }));

    // ── Recent sales leads (24h) ───────────────────────────────────────────
    const { data: recentSalesRows } = await admin
      .from("sales_leads")
      .select("id, lead_name, first_name, last_name, company_name, lead_source, status, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", start24.toISOString())
      .order("created_at", { ascending: false })
      .limit(8);

    const recentSalesLeads = (recentSalesRows ?? []).map((l: Record<string, unknown>) => {
      const name =
        (l.lead_name as string | null) ||
        [l.first_name, l.last_name].filter((p) => p && String(p).trim()).join(" ").trim() ||
        "Unnamed lead";
      const statusValue = (l.status as string | null) || "new";
      const statusLabel = LEAD_STATUS_OPTIONS.find((o) => o.value === statusValue)?.label ?? statusValue;
      return {
        id: String(l.id),
        name,
        company: (l.company_name as string | null) || "—",
        source: (l.lead_source as string | null) || "—",
        status: statusLabel,
        time: l.created_at ? timeAgo(l.created_at as string) : "—",
      };
    });

    // ── Activity feed ──────────────────────────────────────────────────────
    let activityQuery = admin
      .from("activities")
      .select("id, activity_type, related_to_type, related_to_id, notes, activity_date, owner_id, created_at")
      .order("activity_date", { ascending: false })
      .limit(10);

    if (userIds.length > 0) {
      activityQuery = activityQuery.in("owner_id", userIds);
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

    const ownerIds = [...new Set(activityList.map((a) => a.owner_id).filter(Boolean))] as string[];
    let ownerNames: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: ownerUserRows } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", ownerIds);
      (ownerUserRows ?? []).forEach((u: { id: string; full_name: string | null; email: string | null }) => {
        ownerNames[u.id] = u.full_name || u.email || "Unknown";
      });
    }

    const leadsIds = [
      ...new Set(activityList.filter((a) => a.related_to_type === "lead").map((a) => a.related_to_id).filter(Boolean)),
    ] as string[];

    let leadNames: Record<string, string> = {};
    if (leadsIds.length > 0) {
      const { data: leadRows } = await admin
        .from("sales_leads")
        .select("id, lead_name, first_name, last_name")
        .in("id", leadsIds);
      (leadRows ?? []).forEach((r: Record<string, unknown>) => {
        leadNames[r.id as string] =
          (r.lead_name as string) ||
          [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
          "Lead";
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

    type ActivityItem = {
      id: string;
      user: string;
      action: string;
      target: string;
      time: string;
      type: string;
      sortAt: number;
    };

    const activityFeed: ActivityItem[] = activityList.map((a) => {
      const userName = a.owner_id ? ownerNames[a.owner_id] ?? "Unknown" : "Unknown";
      const relId = a.related_to_id;
      const target =
        a.related_to_type === "lead" && relId ? leadNames[relId] ?? "Lead" : a.related_to_type ?? "record";
      const iso = a.activity_date ?? a.created_at ?? new Date().toISOString();
      return {
        id: a.id,
        user: userName,
        action: actionForType(a.activity_type ?? ""),
        target,
        time: timeAgo(iso),
        type: a.activity_type === "lifecycle_change" ? "success" : "default",
        sortAt: new Date(iso).getTime(),
      };
    });

    const userSignupActivities: ActivityItem[] = users
      .filter((u) => new Date(u.created_at) >= addDays(now, -7))
      .slice(0, 5)
      .map((u) => ({
        id: `user-${u.id}`,
        user: "System",
        action: "new user joined",
        target: u.full_name || u.email || "User",
        time: timeAgo(u.created_at),
        type: "info",
        sortAt: new Date(u.created_at).getTime(),
      }));

    const mergedActivity = [...activityFeed, ...userSignupActivities]
      .sort((a, b) => b.sortAt - a.sortAt)
      .slice(0, 8)
      .map(({ sortAt: _sortAt, ...rest }) => rest);

    // ── Pending tasks (org-wide) ───────────────────────────────────────────
    const { data: taskRows } = await admin
      .from("tasks")
      .select("id, title, due_date, priority, status")
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(6);

    const pendingTasks = (taskRows ?? []).map((t: Record<string, unknown>) => ({
      id: String(t.id),
      task: (t.title as string | null) || "Task",
      dueDate: t.due_date
        ? new Date(t.due_date as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "—",
      priority: (t.priority as string | null) ?? "medium",
    }));

    const pendingTasksCount = pendingTasks.length;

    // ── Compose response ───────────────────────────────────────────────────
    return NextResponse.json({
      stats: {
        totalUsers: {
          value: totalUsers.toLocaleString(),
          change: usersThisMonth > 0 ? `+${usersThisMonth} this month` : usersMonthTrend.changeText,
          trend: usersThisMonth > usersPrevMonth ? "up" : usersThisMonth < usersPrevMonth ? "down" : "neutral",
          sub: `${activeUsers} active`,
        },
        campaigns: {
          value: campaigns.length.toLocaleString(),
          change: `${activeCampaigns} active`,
          trend: "neutral" as const,
          sub: `${misAggregates.stats.totalLeadsUploaded.toLocaleString()} campaign leads`,
        },
        clients: {
          value: totalClients.toLocaleString(),
          change: totalClients > 0 ? "In organization" : "No clients yet",
          trend: "neutral" as const,
          sub: "Registered clients",
        },
        salesLeads: {
          value: (salesLeadsTotal ?? 0).toLocaleString(),
          change: salesLeadsTrend.changeText,
          trend: salesLeadsTrend.trend,
          sub: `${salesConversion.toFixed(1)}% converted`,
        },
        opsLeads: {
          value: misAggregates.stats.totalLeadsUploaded.toLocaleString(),
          change: `${misAggregates.stats.qaApprovedLeads} QA approved`,
          trend: "neutral" as const,
          sub: `${opsConversion.toFixed(1)}% qualification rate`,
        },
        roles: {
          value: roles.length.toLocaleString(),
          change: `${rolesWithAssignments} assigned`,
          trend: "neutral" as const,
          sub: "Organization roles",
        },
        pendingTasks: {
          value: String(pendingTasksCount),
          change: pendingTasksCount > 0 ? "Needs attention" : "All clear",
          trend: pendingTasksCount > 3 ? "down" : "neutral",
          sub: "Open CRM tasks",
        },
        qaPending: {
          value: misAggregates.stats.pendingLeads.toLocaleString(),
          change: `${misAggregates.stats.qaRejectedLeads} rejected`,
          trend: misAggregates.stats.pendingLeads > 10 ? "down" : "neutral",
          sub: "Awaiting QA audit",
        },
      },
      userGrowthData,
      roleDistribution,
      leadStatusData,
      dailyUploads,
      salesPipeline,
      campaignPerformance,
      recentUsers,
      recentSalesLeads,
      activityFeed: mergedActivity,
      pendingTasks,
      summary: {
        totalCampaigns: campaigns.length,
        activeCampaigns,
        totalClients,
        totalUsers,
        activeUsers,
        opsLeadsTotal: misAggregates.stats.totalLeadsUploaded,
        salesLeadsTotal: salesLeadsTotal ?? 0,
        qaApproved: misAggregates.stats.qaApprovedLeads,
        qaPending: misAggregates.stats.pendingLeads,
      },
    });
  } catch (err) {
    console.error("Admin dashboard GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
