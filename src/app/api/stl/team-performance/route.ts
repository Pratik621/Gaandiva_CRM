import { NextResponse } from "next/server";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasOrgWideInsightsAccess, isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import { hasSTLAccess, isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import { isAgentRole } from "@/lib/tl/team-hierarchy";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { fetchCampaignIdsForSTL } from "@/lib/campaign/stl-assignments";
import {
  buildQaNameToIdMap,
  isAppStampedQaAudit,
  leadHasQaOutcome,
  qaAuditActivityDay,
  resolveQaUserId,
} from "@/lib/qa-audit-attribution";
import { chunkArray } from "@/lib/postgrest-filter";

export const dynamic = "force-dynamic";

dayjs.extend(utc);
dayjs.extend(timezone);

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentPerformance = {
  agent_id: string;
  agent_name: string;
  agent_code: string | null;
  tl_id: string | null;
  tl_name: string | null;
  total_leads: number;
  qualified_leads: number;
  today_leads: number;
  week_leads: number;
  month_leads: number;
  avg_per_day: number;
  campaigns_worked: number;
  last_upload_date: string | null;
};

export type CampaignPerformance = {
  campaign_id: string;
  campaign_name: string;
  campaign_code: string | null;
  total_allocation: number;
  total_uploaded: number;
  qualified_leads: number;
  progress_pct: number;
  agents_count: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

export type DailyTrend = {
  date: string;
  leads: number;
};

export type STLSummary = {
  stl_id: string;
  stl_name: string;
  agent_count: number;
  campaign_count: number;
  total_leads: number;
  qualified_leads: number;
  disqualified_leads: number;
  delivered_leads: number;
  today_leads: number;
  week_leads: number;
  month_leads: number;
};

export type QASummary = {
  qa_id: string;
  qa_name: string;
  total_audited: number;
  app_audited: number;
  imported_audited: number;
  qualified_leads: number;
  app_qualified_leads: number;
  imported_qualified_leads: number;
  disqualified_leads: number;
  app_disqualified_leads: number;
  imported_disqualified_leads: number;
  rectified_leads: number;
  app_rectified_leads: number;
  imported_rectified_leads: number;
  with_qa_comments: number;
  today_audited: number;
  week_audited: number;
  month_audited: number;
};

export type STLTeamPerformanceResponse = {
  scope: "organization" | "team";
  date_range: { start: string; end: string; single_day: boolean };
  summary: {
    total_leads: number;
    today_leads: number;
    week_leads: number;
    month_leads: number;
    active_campaigns: number;
    total_campaigns: number;
    avg_per_day: number;
    top_performer: { name: string; total: number } | null;
    pending_allocation: number;
    active_stl_count: number;
    active_agent_count: number;
    completion_pct: number;
  };
  agents: AgentPerformance[];
  campaigns: CampaignPerformance[];
  stl_summaries: STLSummary[];
  qa_summaries: QASummary[];
  daily_trend: DailyTrend[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidTimeZone(tz: string | null): tz is string {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function todayInTz(tz: string): string {
  return dayjs().tz(tz).format("YYYY-MM-DD");
}

function weeksAgoInTz(tz: string, n: number): string {
  return dayjs().tz(tz).subtract(n * 7, "day").format("YYYY-MM-DD");
}

function monthsAgoInTz(tz: string, n: number): string {
  return dayjs().tz(tz).subtract(n, "month").format("YYYY-MM-DD");
}

function utcStartOfDayInTz(dateStr: string, tz: string): string {
  return dayjs.tz(`${dateStr} 00:00:00.000`, "YYYY-MM-DD HH:mm:ss.SSS", tz).utc().toISOString();
}

function utcEndOfDayInTz(dateStr: string, tz: string): string {
  return dayjs.tz(`${dateStr} 23:59:59.999`, "YYYY-MM-DD HH:mm:ss.SSS", tz).utc().toISOString();
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

type LeadActivityRow = {
  id: string;
  campaign_id: string;
  assigned_agent_id: string | null;
  created_by: string | null;
  qa_status: string | null;
  delivery_status: string | null;
  created_at: string;
};

function resolveLeadAgentId(lead: {
  assigned_agent_id: string | null;
  created_by: string | null;
}): string | null {
  return lead.assigned_agent_id ?? lead.created_by ?? null;
}

function leadDayInTz(createdAt: string, appTz: string): string {
  return dayjs(createdAt).tz(appTz).format("YYYY-MM-DD");
}

const LEADS_PAGE_SIZE = 1000;

async function fetchLeadActivityRows(
  admin: ReturnType<typeof getAdminClientSafe>,
  params: {
    orgId: string;
    campaignIds: string[];
    startUtc: string;
    endUtc: string;
  }
): Promise<LeadActivityRow[]> {
  if (!admin || params.campaignIds.length === 0) return [];

  const select =
    "id, campaign_id, assigned_agent_id, created_by, qa_status, delivery_status, created_at";
  const all: LeadActivityRow[] = [];

  for (const idBatch of chunkArray(params.campaignIds)) {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin
        .from("leads")
        .select(select)
        .eq("organization_id", params.orgId)
        .in("campaign_id", idBatch)
        .gte("created_at", params.startUtc)
        .lte("created_at", params.endUtc)
        .order("created_at", { ascending: true })
        .range(offset, offset + LEADS_PAGE_SIZE - 1);

      if (error) throw error;
      const rows = (data ?? []) as LeadActivityRow[];
      all.push(...rows);
      if (rows.length < LEADS_PAGE_SIZE) break;
      offset += LEADS_PAGE_SIZE;
    }
  }

  return all;
}

type QaAuditLeadRow = {
  id: string;
  qa_status: string | null;
  qa_name: string | null;
  qa_audited_by_id: string | null;
  qa_audited_at: string | null;
  qa_comments: string | null;
  audit_date: string | null;
  updated_at: string;
};

async function fetchQaAuditLeadRows(
  admin: ReturnType<typeof getAdminClientSafe>,
  orgId: string,
  campaignIds: string[]
): Promise<QaAuditLeadRow[]> {
  if (!admin || campaignIds.length === 0) return [];

  const select =
    "id, qa_status, qa_name, qa_audited_by_id, qa_audited_at, qa_comments, audit_date, updated_at";
  const all: QaAuditLeadRow[] = [];

  for (const idBatch of chunkArray(campaignIds)) {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin
        .from("leads")
        .select(select)
        .eq("organization_id", orgId)
        .in("campaign_id", idBatch)
        .not("qa_status", "is", null)
        .order("updated_at", { ascending: true })
        .range(offset, offset + LEADS_PAGE_SIZE - 1);

      if (error) throw error;
      const rows = (data ?? []) as QaAuditLeadRow[];
      all.push(...rows.filter((l) => leadHasQaOutcome(l.qa_status)));
      if (rows.length < LEADS_PAGE_SIZE) break;
      offset += LEADS_PAGE_SIZE;
    }
  }

  return all;
}

// ─── GET /api/stl/team-performance ────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    if (!hasSTLAccess(roleNames) && !hasOrgWideInsightsAccess(roleNames)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isOM = hasOrgWideInsightsAccess(roleNames);
    const isSTL = !isOM && roleNames.some((n) => isSeniorTeamLeaderRole(n));

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const url = new URL(request.url);
    const tzParam = url.searchParams.get("tz");
    const appTz = isValidTimeZone(tzParam) ? tzParam : "UTC";
    const today = todayInTz(appTz);
    const defaultStart = monthsAgoInTz(appTz, 3);
    const startDate = url.searchParams.get("start_date") || defaultStart;
    const endDate = url.searchParams.get("end_date") || today;
    const campaignIdFilter = url.searchParams.get("campaign_id") || null;
    const userIdFilter = url.searchParams.get("user_id") || null;
    const tlIdFilter = url.searchParams.get("tl_id") || null;
    const startUtc = utcStartOfDayInTz(startDate, appTz);
    const endUtc = utcEndOfDayInTz(endDate, appTz);
    const singleDayRange = startDate === endDate;

    const { data: allUsers, error: usersErr } = await admin
      .from("users")
      .select("id, full_name, email, agent_code, status, reporting_manager_id, user_roles(roles(name))")
      .eq("organization_id", orgId)
      .eq("status", "active");

    if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });

    type OrgUser = {
      id: string;
      full_name: string | null;
      email: string | null;
      agent_code: string | null;
      status: string;
      reporting_manager_id: string | null;
      user_roles: { roles: { name: string } | null }[] | null;
    };

    const orgUsers = (allUsers ?? []) as OrgUser[];

    const userLabel = (u: OrgUser) => u.full_name?.trim() || u.email?.trim() || "Unknown";
    const userIsAgent = (u: OrgUser) => (u.user_roles ?? []).some((r) => isAgentRole(r.roles?.name));
    const userIsTL = (u: OrgUser) =>
      (u.user_roles ?? []).some((r) => isCampaignTeamLeaderRole(r.roles?.name));
    const userIsSTL = (u: OrgUser) =>
      (u.user_roles ?? []).some((r) => isSeniorTeamLeaderRole(r.roles?.name));
    const userIsQA = (u: OrgUser) =>
      (u.user_roles ?? []).some((r) => {
        const n = (r.roles?.name ?? "").trim().toLowerCase().replace(/\s+/g, "_");
        return n === "qa";
      });

    const tlById = new Map(orgUsers.filter(userIsTL).map((tl) => [tl.id, tl]));
    const allSTLs = orgUsers.filter(userIsSTL);

    // Agents reporting to the filtered Team Leader — "his team", per the tl_id filter.
    const tlAgentIds = tlIdFilter
      ? new Set(orgUsers.filter((u) => u.reporting_manager_id === tlIdFilter).map((u) => u.id))
      : null;

    // ── Scope campaigns (STL: only campaigns assigned to this STL) ───────────
    let campaignsQuery = admin
      .from("campaigns")
      .select("id, name, campaign_code, total_allocation, pending_allocation, status, assigned_stl_id, start_date, end_date")
      .eq("organization_id", orgId);

    if (campaignIdFilter) {
      campaignsQuery = campaignsQuery.eq("id", campaignIdFilter);
    }

    const { data: campaigns, error: campErr } = await campaignsQuery;
    if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });

    type CampaignRow = {
      id: string;
      name: string;
      campaign_code: string | null;
      total_allocation: number | null;
      pending_allocation: number | null;
      status: string;
      assigned_stl_id: string | null;
      start_date: string | null;
      end_date: string | null;
    };

    let scopedCampaigns = (campaigns ?? []) as CampaignRow[];

    if (isSTL) {
      const junctionCampaignIds = new Set(await fetchCampaignIdsForSTL(supabase, user.id, orgId));
      scopedCampaigns = scopedCampaigns.filter(
        (c) => c.assigned_stl_id === user.id || junctionCampaignIds.has(c.id)
      );
    }

    const scopedCampaignIds = scopedCampaigns.map((c) => c.id);
    const campById = new Map(scopedCampaigns.map((c) => [c.id, c]));

    // ── Agents in scope: whoever is actively assigned to a scoped campaign ───
    let scopedAgentIds = new Set<string>();
    let allCampAssignments: { campaign_id: string; agent_id: string }[] = [];
    if (scopedCampaignIds.length > 0) {
      const caBatches = await Promise.all(
        chunkArray(scopedCampaignIds).map(async (idBatch) => {
          const { data } = await admin
            .from("campaign_assignments")
            .select("campaign_id, agent_id")
            .in("campaign_id", idBatch)
            .eq("is_active", true);
          return (data ?? []) as { campaign_id: string; agent_id: string }[];
        })
      );
      allCampAssignments = caBatches.flat();
    }
    if (isOM) {
      scopedAgentIds = new Set(orgUsers.filter(userIsAgent).map((u) => u.id));
    } else {
      for (const row of allCampAssignments) {
        scopedAgentIds.add(row.agent_id);
      }
    }

    if (tlAgentIds) {
      scopedAgentIds = new Set([...scopedAgentIds].filter((id) => tlAgentIds.has(id)));
    }

    if (userIdFilter) {
      scopedAgentIds = scopedAgentIds.has(userIdFilter) ? new Set([userIdFilter]) : new Set();
    }

    const scopedAgentIdArr = [...scopedAgentIds];

    // ── Leads in range for scoped campaigns ───────────────────────────────────
    let leadsInRange: LeadActivityRow[] = [];
    if (scopedCampaignIds.length > 0) {
      try {
        leadsInRange = await fetchLeadActivityRows(admin, {
          orgId,
          campaignIds: scopedCampaignIds,
          startUtc,
          endUtc,
        });
      } catch (leadsErr) {
        const msg = leadsErr instanceof Error ? leadsErr.message : "Failed to load leads";
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      if (campaignIdFilter) leadsInRange = leadsInRange.filter((l) => l.campaign_id === campaignIdFilter);
      if (tlAgentIds) {
        leadsInRange = leadsInRange.filter((l) => {
          const agId = resolveLeadAgentId(l);
          return agId ? tlAgentIds.has(agId) : false;
        });
      }
      if (userIdFilter) leadsInRange = leadsInRange.filter((l) => resolveLeadAgentId(l) === userIdFilter);
    }

    const agentActivityCampaignIds = new Set<string>();
    for (const row of allCampAssignments) {
      if (!scopedAgentIds.has(row.agent_id)) continue;
      agentActivityCampaignIds.add(row.campaign_id);
    }

    let agentActivityLeads: LeadActivityRow[] = [];
    const agentCampIdList = [...agentActivityCampaignIds];
    if (agentCampIdList.length > 0) {
      try {
        agentActivityLeads = await fetchLeadActivityRows(admin, {
          orgId,
          campaignIds: agentCampIdList,
          startUtc,
          endUtc,
        });
      } catch (agentLeadsErr) {
        const msg = agentLeadsErr instanceof Error ? agentLeadsErr.message : "Failed to load leads";
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      if (userIdFilter) {
        agentActivityLeads = agentActivityLeads.filter((l) => resolveLeadAgentId(l) === userIdFilter);
      }
    }

    const weekStart = weeksAgoInTz(appTz, 1);
    const monthStart = monthsAgoInTz(appTz, 1);
    const weekStartInRange = singleDayRange ? startDate : weekStart < startDate ? startDate : weekStart;
    const monthStartInRange = singleDayRange ? startDate : monthStart < startDate ? startDate : monthStart;

    const agentLeadMap = new Map<
      string,
      { total: number; qualified: number; today: number; week: number; month: number; campaignSet: Set<string>; lastDate: string | null }
    >();

    const isQualifiedQa = (qa: string | null | undefined) => {
      const q = String(qa ?? "").trim().toLowerCase();
      return q === "qualified" || q === "approved" || q === "pass";
    };

    const initAgent = () => ({
      total: 0,
      qualified: 0,
      today: 0,
      week: 0,
      month: 0,
      campaignSet: new Set<string>(),
      lastDate: null as string | null,
    });

    for (const l of agentActivityLeads) {
      const agId = resolveLeadAgentId(l);
      if (!agId || !scopedAgentIds.has(agId)) continue;
      if (!agentLeadMap.has(agId)) agentLeadMap.set(agId, initAgent());
      const agg = agentLeadMap.get(agId)!;
      agg.total++;
      if (isQualifiedQa(l.qa_status)) agg.qualified++;
      const d = leadDayInTz(l.created_at, appTz);
      if (singleDayRange) {
        agg.today = agg.total;
        agg.week = agg.total;
        agg.month = agg.total;
      } else {
        if (d === today) agg.today++;
        if (d >= weekStartInRange) agg.week++;
        if (d >= monthStartInRange) agg.month++;
      }
      agg.campaignSet.add(l.campaign_id);
      if (!agg.lastDate || d > agg.lastDate) agg.lastDate = d;
    }

    const totalDays = daysBetween(startDate, endDate);

    const agentRows: AgentPerformance[] = scopedAgentIdArr.map((agId) => {
      const u = orgUsers.find((x) => x.id === agId);
      const agg = agentLeadMap.get(agId) ?? initAgent();
      const tlRow = u?.reporting_manager_id ? tlById.get(u.reporting_manager_id) : undefined;
      return {
        agent_id: agId,
        agent_name: u ? userLabel(u) : agId,
        agent_code: u?.agent_code ?? null,
        tl_id: tlRow?.id ?? null,
        tl_name: tlRow ? userLabel(tlRow) : null,
        total_leads: agg.total,
        qualified_leads: agg.qualified,
        today_leads: agg.today,
        week_leads: agg.week,
        month_leads: agg.month,
        avg_per_day: Number((agg.total / totalDays).toFixed(2)),
        campaigns_worked: agg.campaignSet.size,
        last_upload_date: agg.lastDate,
      };
    });

    agentRows.sort((a, b) => b.total_leads - a.total_leads);

    // ── STL summaries (OM view — per-STL rollups) ─────────────────────────────
    const stlSummaries: STLSummary[] = [];
    if (isOM) {
      const allCampaignRows = (campaigns ?? []) as CampaignRow[];
      for (const stl of allSTLs) {
        const stlCampaigns = allCampaignRows.filter((c) => c.assigned_stl_id === stl.id);
        const stlCampIds = new Set(stlCampaigns.map((c) => c.id));
        const stlAgentIds = new Set(
          allCampAssignments.filter((a) => stlCampIds.has(a.campaign_id)).map((a) => a.agent_id)
        );

        let totalLeads = 0;
        let qualifiedLeads = 0;
        let disqualifiedLeads = 0;
        let deliveredLeads = 0;
        let todayLeads = 0;
        let weekLeads = 0;
        let monthLeads = 0;

        for (const l of leadsInRange) {
          if (!stlCampIds.has(l.campaign_id)) continue;
          const agId = resolveLeadAgentId(l);
          if (!agId || !stlAgentIds.has(agId)) continue;
          totalLeads++;
          if (isQualifiedQa(l.qa_status)) qualifiedLeads++;
          const qa = String(l.qa_status ?? "").trim().toLowerCase();
          if (qa === "disqualified") disqualifiedLeads++;
          const ds = String(l.delivery_status ?? "").trim().toLowerCase();
          if (ds === "delivered" || ds === "delivered_by_mis") deliveredLeads++;
          const d = leadDayInTz(l.created_at, appTz);
          if (singleDayRange) {
            todayLeads = totalLeads;
            weekLeads = totalLeads;
            monthLeads = totalLeads;
          } else {
            if (d === today) todayLeads++;
            if (d >= weekStartInRange) weekLeads++;
            if (d >= monthStartInRange) monthLeads++;
          }
        }

        stlSummaries.push({
          stl_id: stl.id,
          stl_name: userLabel(stl),
          agent_count: stlAgentIds.size,
          campaign_count: stlCampaigns.length,
          total_leads: totalLeads,
          qualified_leads: qualifiedLeads,
          disqualified_leads: disqualifiedLeads,
          delivered_leads: deliveredLeads,
          today_leads: todayLeads,
          week_leads: weekLeads,
          month_leads: monthLeads,
        });
      }
      stlSummaries.sort((a, b) => b.total_leads - a.total_leads);
    }

    // ── QA summaries (OM / admin — audit activity in date range) ─────────────
    const qaSummaries: QASummary[] = [];
    if (isOM) {
      const allQAs = orgUsers.filter(userIsQA);
      const qaIds = new Set(allQAs.map((qa) => qa.id));
      const qaRefs = allQAs.map((qa) => ({ id: qa.id, full_name: qa.full_name, email: qa.email }));
      const qaNameToId = buildQaNameToIdMap(qaRefs, (qa) => {
        const row = allQAs.find((u) => u.id === qa.id)!;
        return userLabel(row);
      });

      const qaCampaignIds = campaignIdFilter
        ? scopedCampaignIds
        : (campaigns ?? []).map((c) => (c as { id: string }).id);

      let auditLeads: QaAuditLeadRow[] = [];
      if (qaCampaignIds.length > 0 && qaIds.size > 0) {
        try {
          auditLeads = await fetchQaAuditLeadRows(admin, orgId, qaCampaignIds);
        } catch (auditErr) {
          const message = auditErr instanceof Error ? auditErr.message : "Failed to load QA audits";
          return NextResponse.json({ error: message }, { status: 500 });
        }
      }

      const formatAuditDay = (iso: string, tz: string) => dayjs(iso).tz(tz).format("YYYY-MM-DD");

      const initQaAgg = () => ({
        total: 0,
        app: 0,
        imported: 0,
        qualified: 0,
        appQualified: 0,
        importedQualified: 0,
        disqualified: 0,
        appDisqualified: 0,
        importedDisqualified: 0,
        rectified: 0,
        appRectified: 0,
        importedRectified: 0,
        withComments: 0,
        today: 0,
        week: 0,
        month: 0,
      });

      const qaAggMap = new Map<string, ReturnType<typeof initQaAgg>>();
      for (const qa of allQAs) qaAggMap.set(qa.id, initQaAgg());

      const isQualifiedQaStatus = (qa: string | null | undefined) => {
        const q = String(qa ?? "").trim().toLowerCase();
        return q === "qualified" || q === "approved" || q === "pass";
      };
      const isDisqualifiedQaStatus = (qa: string | null | undefined) =>
        String(qa ?? "").trim().toLowerCase() === "disqualified";
      const isRectifiedQaStatus = (qa: string | null | undefined) =>
        String(qa ?? "").trim().toLowerCase() === "rectified";

      const countedLeadKeys = new Set<string>();

      for (const l of auditLeads) {
        const isApp = isAppStampedQaAudit(l.qa_audited_by_id, qaIds);
        const qaId = resolveQaUserId(l.qa_audited_by_id, l.qa_name, qaIds, qaNameToId);
        if (!qaId) continue;

        const activityDay = qaAuditActivityDay(l, isApp, appTz, formatAuditDay);
        if (activityDay < startDate || activityDay > endDate) continue;

        const dedupeKey = `${qaId}:${l.id}`;
        if (countedLeadKeys.has(dedupeKey)) continue;
        countedLeadKeys.add(dedupeKey);

        const agg = qaAggMap.get(qaId)!;
        agg.total++;
        if (isApp) agg.app++;
        else agg.imported++;

        if (isQualifiedQaStatus(l.qa_status)) {
          agg.qualified++;
          if (isApp) agg.appQualified++;
          else agg.importedQualified++;
        }
        if (isDisqualifiedQaStatus(l.qa_status)) {
          agg.disqualified++;
          if (isApp) agg.appDisqualified++;
          else agg.importedDisqualified++;
        }
        if (isRectifiedQaStatus(l.qa_status)) {
          agg.rectified++;
          if (isApp) agg.appRectified++;
          else agg.importedRectified++;
        }
        if (String(l.qa_comments ?? "").trim()) agg.withComments++;
        if (activityDay === today) agg.today++;
        if (activityDay >= weekStart) agg.week++;
        if (activityDay >= monthStart) agg.month++;
      }

      for (const qa of allQAs) {
        const agg = qaAggMap.get(qa.id)!;
        qaSummaries.push({
          qa_id: qa.id,
          qa_name: userLabel(qa),
          total_audited: agg.total,
          app_audited: agg.app,
          imported_audited: agg.imported,
          qualified_leads: agg.qualified,
          app_qualified_leads: agg.appQualified,
          imported_qualified_leads: agg.importedQualified,
          disqualified_leads: agg.disqualified,
          app_disqualified_leads: agg.appDisqualified,
          imported_disqualified_leads: agg.importedDisqualified,
          rectified_leads: agg.rectified,
          app_rectified_leads: agg.appRectified,
          imported_rectified_leads: agg.importedRectified,
          with_qa_comments: agg.withComments,
          today_audited: agg.today,
          week_audited: agg.week,
          month_audited: agg.month,
        });
      }
      qaSummaries.sort((a, b) => b.total_audited - a.total_audited);
    }

    // ── Campaign performance ─────────────────────────────────────────────────
    const campAgentMap = new Map<string, Set<string>>();
    const campLeadMap = new Map<string, number>();
    const campQualifiedMap = new Map<string, number>();
    for (const l of leadsInRange) {
      if (!campById.has(l.campaign_id)) continue;
      campLeadMap.set(l.campaign_id, (campLeadMap.get(l.campaign_id) ?? 0) + 1);
      if (isQualifiedQa(l.qa_status)) {
        campQualifiedMap.set(l.campaign_id, (campQualifiedMap.get(l.campaign_id) ?? 0) + 1);
      }
      if (!campAgentMap.has(l.campaign_id)) campAgentMap.set(l.campaign_id, new Set());
      const agId = resolveLeadAgentId(l);
      if (agId) campAgentMap.get(l.campaign_id)!.add(agId);
    }

    const campaignPerf: CampaignPerformance[] = scopedCampaigns.map((c) => {
      const uploaded = campLeadMap.get(c.id) ?? 0;
      const qualified = campQualifiedMap.get(c.id) ?? 0;
      const alloc = c.total_allocation ?? 0;
      const progressNumerator = isOM ? qualified : uploaded;
      return {
        campaign_id: c.id,
        campaign_name: c.name,
        campaign_code: c.campaign_code,
        total_allocation: alloc,
        total_uploaded: uploaded,
        qualified_leads: qualified,
        progress_pct: alloc > 0 ? Math.min(100, Math.round((progressNumerator / alloc) * 100)) : 0,
        agents_count: campAgentMap.get(c.id)?.size ?? 0,
        status: c.status,
        start_date: c.start_date ?? null,
        end_date: c.end_date ?? null,
      };
    });

    campaignPerf.sort((a, b) =>
      isOM ? b.qualified_leads - a.qualified_leads : b.total_uploaded - a.total_uploaded
    );

    const oneMonthAgo = monthsAgoInTz(appTz, 1);
    const trendStart = startDate < oneMonthAgo ? oneMonthAgo : startDate;

    const dailyMap = new Map<string, number>();
    for (const l of leadsInRange) {
      const d = dayjs(l.created_at).tz(appTz).format("YYYY-MM-DD");
      if (d >= trendStart) {
        dailyMap.set(d, (dailyMap.get(d) ?? 0) + 1);
      }
    }

    const dailyTrend: DailyTrend[] = [];
    let cursor = dayjs(trendStart);
    const endCursor = dayjs(endDate);
    while (cursor.isBefore(endCursor) || cursor.isSame(endCursor, "day")) {
      const ds = cursor.format("YYYY-MM-DD");
      dailyTrend.push({ date: ds, leads: dailyMap.get(ds) ?? 0 });
      cursor = cursor.add(1, "day");
    }

    const totalLeads = leadsInRange.length;
    let todayLeads: number;
    let weekLeads: number;
    let monthLeads: number;
    if (singleDayRange) {
      todayLeads = totalLeads;
      weekLeads = totalLeads;
      monthLeads = totalLeads;
    } else {
      todayLeads = leadsInRange.filter((l) => leadDayInTz(l.created_at, appTz) === today).length;
      weekLeads = leadsInRange.filter((l) => leadDayInTz(l.created_at, appTz) >= weekStartInRange).length;
      monthLeads = leadsInRange.filter((l) => leadDayInTz(l.created_at, appTz) >= monthStartInRange).length;
    }
    const activeCampaigns = scopedCampaigns.filter((c) => c.status === "active").length;
    const pendingAlloc = scopedCampaigns.reduce(
      (s, c) => s + (c.pending_allocation ?? c.total_allocation ?? 0),
      0
    );
    const totalAlloc = scopedCampaigns.reduce((s, c) => s + (c.total_allocation ?? 0), 0);
    const totalUploaded = campaignPerf.reduce((s, c) => s + c.total_uploaded, 0);
    const totalQualified = campaignPerf.reduce((s, c) => s + c.qualified_leads, 0);
    const completionPct =
      totalAlloc > 0
        ? Math.min(100, Math.round(((isOM ? totalQualified : totalUploaded) / totalAlloc) * 100))
        : 0;

    const topPerformer =
      agentRows.length > 0 && agentRows[0].total_leads > 0
        ? { name: agentRows[0].agent_name, total: agentRows[0].total_leads }
        : null;

    const activeStlCount = isOM ? stlSummaries.filter((s) => s.agent_count > 0).length : 0;

    const response: STLTeamPerformanceResponse = {
      scope: isOM ? "organization" : "team",
      date_range: { start: startDate, end: endDate, single_day: singleDayRange },
      summary: {
        total_leads: totalLeads,
        today_leads: todayLeads,
        week_leads: weekLeads,
        month_leads: monthLeads,
        active_campaigns: activeCampaigns,
        total_campaigns: scopedCampaigns.length,
        avg_per_day: Number((totalLeads / totalDays).toFixed(2)),
        top_performer: topPerformer,
        pending_allocation: pendingAlloc,
        active_stl_count: activeStlCount,
        active_agent_count: scopedAgentIdArr.length,
        completion_pct: completionPct,
      },
      agents: agentRows,
      campaigns: campaignPerf,
      stl_summaries: stlSummaries,
      qa_summaries: qaSummaries,
      daily_trend: dailyTrend,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("STL team performance error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
