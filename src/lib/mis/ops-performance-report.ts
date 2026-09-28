import type { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  buildQaNameToIdMap,
  isAppStampedQaAudit,
  leadHasQaOutcome,
  qaAuditActivityDay,
  resolveQaUserId,
  type QaUserRef,
} from "@/lib/qa-audit-attribution";
import {
  isLeadAudited,
  isLeadPendingAudit,
  isLeadQualified,
} from "@/lib/qa-lead-audit";
import { fetchAllByIdChunks } from "@/lib/supabase/in-chunks";

dayjs.extend(utc);
dayjs.extend(timezone);

export type OpsPerformanceSummary = {
  total_leads: number;
  qualified: number;
  disqualified: number;
  rectified: number;
  tbd: number;
  qa_reviewed: number;
  qa_qualified: number;
  qa_disqualified: number;
  qualified_pct: number;
  disq_rate: number;
};

export type AgentDailyRow = {
  date: string;
  agent_id: string;
  agent_name: string;
  qualified: number;
  disqualified: number;
  rectified: number;
  tbd: number;
  grand_total: number;
};

export type AgentConsolidatedRow = {
  agent_id: string;
  agent_name: string;
  qualified: number;
  disqualified: number;
  rectified: number;
  tbd: number;
  grand_total: number;
  qual_pct: number;
};

export type QaAuditorDetailRow = {
  qa_id: string;
  qa_name: string;
  campaign_id: string;
  campaign_name: string;
  qualified: number;
  disqualified: number;
  rectified: number;
  tbd: number;
  grand_total: number;
};

export type QaAuditorConsolidatedRow = {
  qa_id: string;
  qa_name: string;
  qualified: number;
  disqualified: number;
  rectified: number;
  tbd: number;
  grand_total: number;
  qual_pct: number;
};

export type QaAuditorChartPoint = {
  name: string;
  qualified: number;
  disqualified: number;
  rectified: number;
  total: number;
};

export type DailyVolumePoint = {
  date: string;
  total: number;
  qualified: number;
  disqualified: number;
};

export type AgentProcessingChartPoint = {
  name: string;
  total: number;
  qualified: number;
};

export type OpsPerformanceReport = {
  date_range: {
    start: string;
    end: string;
    start_time?: string;
    end_time?: string;
  };
  summary: OpsPerformanceSummary;
  charts: {
    qa_auditor_performance: QaAuditorChartPoint[];
    daily_lead_volume: DailyVolumePoint[];
    agent_lead_processing: AgentProcessingChartPoint[];
  };
  tables: {
    agent_daily: AgentDailyRow[];
    agent_consolidated: AgentConsolidatedRow[];
    qa_auditor_detail: QaAuditorDetailRow[];
    qa_auditor_consolidated: QaAuditorConsolidatedRow[];
  };
};

type LeadRow = {
  id: string;
  campaign_id: string;
  assigned_agent_id: string | null;
  created_by: string | null;
  qa_status: string | null;
  qa_name: string | null;
  qa_audited_by_id: string | null;
  qa_audited_at: string | null;
  audit_date: string | null;
  updated_at: string;
  created_at: string;
  channel?: string | null;
};

export type OpsLeadFetchFilters = {
  channels?: string[] | null;
  qaStatuses?: string[] | null;
};

type OutcomeCounts = {
  qualified: number;
  disqualified: number;
  rectified: number;
  tbd: number;
};

function emptyCounts(): OutcomeCounts {
  return { qualified: 0, disqualified: 0, rectified: 0, tbd: 0 };
}

function normQa(qa: string | null | undefined): string {
  return String(qa ?? "").trim().toLowerCase();
}

function isExactDisqualified(qa: string | null | undefined): boolean {
  return normQa(qa) === "disqualified";
}

function isExactRectified(qa: string | null | undefined): boolean {
  return normQa(qa) === "rectified";
}

function classifyLead(qaStatus: string | null | undefined): keyof OutcomeCounts {
  if (isLeadPendingAudit(qaStatus)) return "tbd";
  if (isLeadQualified(qaStatus)) return "qualified";
  if (isExactRectified(qaStatus)) return "rectified";
  if (isExactDisqualified(qaStatus)) return "disqualified";
  if (isLeadAudited(qaStatus)) return "disqualified";
  return "tbd";
}

function matchesQaStatusFilter(
  qaStatus: string | null | undefined,
  qaStatuses: string[] | null | undefined
): boolean {
  if (!qaStatuses?.length) return true;
  const bucket = classifyLead(qaStatus);
  const wanted = new Set(qaStatuses.map((s) => s.trim().toLowerCase()));
  if (wanted.has(bucket)) return true;
  const raw = normQa(qaStatus);
  return Boolean(raw && wanted.has(raw));
}

function addOutcome(counts: OutcomeCounts, qaStatus: string | null | undefined) {
  counts[classifyLead(qaStatus)] += 1;
}

function grandTotal(counts: OutcomeCounts): number {
  return counts.qualified + counts.disqualified + counts.rectified + counts.tbd;
}

function qualPct(counts: OutcomeCounts): number {
  const total = grandTotal(counts);
  if (total <= 0) return 0;
  return Number(((counts.qualified / total) * 100).toFixed(1));
}

function resolveLeadAgentId(lead: LeadRow): string | null {
  return lead.assigned_agent_id ?? lead.created_by ?? null;
}

function leadDayInTz(createdAt: string, tz: string): string {
  return dayjs(createdAt).tz(tz).format("YYYY-MM-DD");
}

/** Prefer stamped audit instant for exact datetime filtering. */
function qaAuditActivityInstant(
  lead: LeadRow,
  isAppAudit: boolean
): string | null {
  if (isAppAudit) {
    return lead.qa_audited_at || lead.updated_at || null;
  }
  if (lead.qa_audited_at) return lead.qa_audited_at;
  // Date-only audit_date has no reliable time — caller falls back to day bounds.
  if (lead.audit_date?.trim()) return null;
  return lead.updated_at || null;
}

const LEAD_SELECT =
  "id, campaign_id, assigned_agent_id, created_by, qa_status, qa_name, qa_audited_by_id, qa_audited_at, audit_date, updated_at, created_at, channel";

async function fetchOrgLeadRows(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[],
  startUtc: string,
  endUtc: string,
  leadFilters?: OpsLeadFetchFilters
): Promise<LeadRow[]> {
  if (campaignIds.length === 0) return [];

  const rows = await fetchAllByIdChunks<LeadRow>(
    campaignIds,
    async (idChunk, from, to) => {
      let query = supabase
        .from("leads")
        .select(LEAD_SELECT)
        .eq("organization_id", orgId)
        .in("campaign_id", idChunk)
        .gte("created_at", startUtc)
        .lte("created_at", endUtc)
        .order("created_at", { ascending: true })
        .range(from, to);

      if (leadFilters?.channels?.length) {
        query = query.in("channel", leadFilters.channels);
      }

      return query;
    }
  );

  return rows.filter((l) => matchesQaStatusFilter(l.qa_status, leadFilters?.qaStatuses));
}

async function fetchQaAuditLeadRows(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[],
  leadFilters?: OpsLeadFetchFilters
): Promise<LeadRow[]> {
  if (campaignIds.length === 0) return [];

  const rows = await fetchAllByIdChunks<LeadRow>(
    campaignIds,
    async (idChunk, from, to) => {
      let query = supabase
        .from("leads")
        .select(LEAD_SELECT)
        .eq("organization_id", orgId)
        .in("campaign_id", idChunk)
        .not("qa_status", "is", null)
        .order("updated_at", { ascending: true })
        .range(from, to);

      if (leadFilters?.channels?.length) {
        query = query.in("channel", leadFilters.channels);
      }

      return query;
    }
  );

  return rows
    .filter((l) => leadHasQaOutcome(l.qa_status))
    .filter((l) => matchesQaStatusFilter(l.qa_status, leadFilters?.qaStatuses));
}

export async function buildOpsPerformanceReport(
  supabase: SupabaseClient,
  orgId: string,
  params: {
    startDate: string;
    endDate: string;
    startUtc: string;
    endUtc: string;
    appTz: string;
    userLabel: (id: string, fallback?: string | null) => string;
    agentIds: Set<string>;
    restrictLeadsToAgents?: boolean;
    qaUsers: QaUserRef[];
    qaIds: Set<string>;
    qaNameToId: Map<string, string>;
    campaignIds: string[];
    campaignNameById: Map<string, string>;
    leadFilters?: OpsLeadFetchFilters;
  }
): Promise<OpsPerformanceReport> {
  const {
    startDate,
    endDate,
    startUtc,
    endUtc,
    appTz,
    userLabel,
    agentIds,
    restrictLeadsToAgents = false,
    qaUsers,
    qaIds,
    qaNameToId,
    campaignIds,
    campaignNameById,
    leadFilters,
  } = params;

  const leadsRaw = await fetchOrgLeadRows(
    supabase,
    orgId,
    campaignIds,
    startUtc,
    endUtc,
    leadFilters
  );
  const auditLeadsRaw = await fetchQaAuditLeadRows(
    supabase,
    orgId,
    campaignIds,
    leadFilters
  );

  const leads = restrictLeadsToAgents
    ? leadsRaw.filter((l) => {
        const id = resolveLeadAgentId(l);
        return Boolean(id && agentIds.has(id));
      })
    : leadsRaw;

  const auditLeads = restrictLeadsToAgents
    ? auditLeadsRaw.filter((l) => {
        const id = resolveLeadAgentId(l);
        return Boolean(id && agentIds.has(id));
      })
    : auditLeadsRaw;

  const summaryCounts = emptyCounts();
  const dailyByAgent = new Map<string, OutcomeCounts>();
  const consolidatedByAgent = new Map<string, OutcomeCounts>();
  const dailyByDay = new Map<string, OutcomeCounts>();
  const agentProcessing = new Map<string, OutcomeCounts>();

  for (const lead of leads) {
    addOutcome(summaryCounts, lead.qa_status);

    const day = leadDayInTz(lead.created_at, appTz);
    if (!dailyByDay.has(day)) dailyByDay.set(day, emptyCounts());
    addOutcome(dailyByDay.get(day)!, lead.qa_status);

    const agentId = resolveLeadAgentId(lead);
    if (agentId && agentIds.has(agentId)) {
      const dailyKey = `${day}:${agentId}`;
      if (!dailyByAgent.has(dailyKey)) dailyByAgent.set(dailyKey, emptyCounts());
      addOutcome(dailyByAgent.get(dailyKey)!, lead.qa_status);

      if (!consolidatedByAgent.has(agentId)) consolidatedByAgent.set(agentId, emptyCounts());
      addOutcome(consolidatedByAgent.get(agentId)!, lead.qa_status);

      if (!agentProcessing.has(agentId)) agentProcessing.set(agentId, emptyCounts());
      addOutcome(agentProcessing.get(agentId)!, lead.qa_status);
    }
  }

  const qaDetailMap = new Map<string, OutcomeCounts>();
  const qaConsolidatedMap = new Map<string, OutcomeCounts>();
  const qaChartMap = new Map<string, OutcomeCounts>();
  const countedAuditKeys = new Set<string>();

  const formatAuditDay = (iso: string, tz: string) => dayjs(iso).tz(tz).format("YYYY-MM-DD");

  for (const lead of auditLeads) {
    const isApp = isAppStampedQaAudit(lead.qa_audited_by_id, qaIds);
    const qaId = resolveQaUserId(lead.qa_audited_by_id, lead.qa_name, qaIds, qaNameToId);
    if (!qaId) continue;

    const activityInstant = qaAuditActivityInstant(lead, isApp);
    if (activityInstant) {
      if (activityInstant < startUtc || activityInstant > endUtc) continue;
    } else {
      const activityDay = qaAuditActivityDay(lead, isApp, appTz, formatAuditDay);
      if (activityDay < startDate || activityDay > endDate) continue;
    }

    const dedupeKey = `${qaId}:${lead.id}`;
    if (countedAuditKeys.has(dedupeKey)) continue;
    countedAuditKeys.add(dedupeKey);

    const detailKey = `${qaId}:${lead.campaign_id}`;
    if (!qaDetailMap.has(detailKey)) qaDetailMap.set(detailKey, emptyCounts());
    addOutcome(qaDetailMap.get(detailKey)!, lead.qa_status);

    if (!qaConsolidatedMap.has(qaId)) qaConsolidatedMap.set(qaId, emptyCounts());
    addOutcome(qaConsolidatedMap.get(qaId)!, lead.qa_status);

    if (!qaChartMap.has(qaId)) qaChartMap.set(qaId, emptyCounts());
    addOutcome(qaChartMap.get(qaId)!, lead.qa_status);
  }

  const totalLeads = leads.length;
  const qaReviewed = leads.filter((l) => isLeadAudited(l.qa_status)).length;

  const summary: OpsPerformanceSummary = {
    total_leads: totalLeads,
    qualified: summaryCounts.qualified,
    disqualified: summaryCounts.disqualified,
    rectified: summaryCounts.rectified,
    tbd: summaryCounts.tbd,
    qa_reviewed: qaReviewed,
    qa_qualified: summaryCounts.qualified,
    qa_disqualified: summaryCounts.disqualified,
    qualified_pct: qualPct(summaryCounts),
    disq_rate: totalLeads > 0
      ? Number(((summaryCounts.disqualified / totalLeads) * 100).toFixed(1))
      : 0,
  };

  const agentDaily: AgentDailyRow[] = [...dailyByAgent.entries()]
    .map(([key, counts]) => {
      const [date, agentId] = key.split(":");
      return {
        date,
        agent_id: agentId,
        agent_name: userLabel(agentId),
        qualified: counts.qualified,
        disqualified: counts.disqualified,
        rectified: counts.rectified,
        tbd: counts.tbd,
        grand_total: grandTotal(counts),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.agent_name.localeCompare(b.agent_name));

  const agentConsolidated: AgentConsolidatedRow[] = [...consolidatedByAgent.entries()]
    .map(([agentId, counts]) => ({
      agent_id: agentId,
      agent_name: userLabel(agentId),
      qualified: counts.qualified,
      disqualified: counts.disqualified,
      rectified: counts.rectified,
      tbd: counts.tbd,
      grand_total: grandTotal(counts),
      qual_pct: qualPct(counts),
    }))
    .sort((a, b) => b.grand_total - a.grand_total);

  const qaAuditorDetail: QaAuditorDetailRow[] = [...qaDetailMap.entries()]
    .map(([key, counts]) => {
      const [qaId, campaignId] = key.split(":");
      return {
        qa_id: qaId,
        qa_name: userLabel(qaId),
        campaign_id: campaignId,
        campaign_name: campaignNameById.get(campaignId) ?? "—",
        qualified: counts.qualified,
        disqualified: counts.disqualified,
        rectified: counts.rectified,
        tbd: counts.tbd,
        grand_total: grandTotal(counts),
      };
    })
    .sort(
      (a, b) =>
        a.qa_name.localeCompare(b.qa_name) || b.grand_total - a.grand_total
    );

  const qaAuditorConsolidated: QaAuditorConsolidatedRow[] = [...qaConsolidatedMap.entries()]
    .map(([qaId, counts]) => ({
      qa_id: qaId,
      qa_name: userLabel(qaId),
      qualified: counts.qualified,
      disqualified: counts.disqualified,
      rectified: counts.rectified,
      tbd: counts.tbd,
      grand_total: grandTotal(counts),
      qual_pct: qualPct(counts),
    }))
    .sort((a, b) => b.grand_total - a.grand_total);

  const qaAuditorPerformance: QaAuditorChartPoint[] = [...qaChartMap.entries()]
    .map(([qaId, counts]) => ({
      name: userLabel(qaId),
      qualified: counts.qualified,
      disqualified: counts.disqualified,
      rectified: counts.rectified,
      total: grandTotal(counts),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const dailyLeadVolume: DailyVolumePoint[] = [...dailyByDay.entries()]
    .map(([date, counts]) => ({
      date,
      total: grandTotal(counts),
      qualified: counts.qualified,
      disqualified: counts.disqualified,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const agentLeadProcessing: AgentProcessingChartPoint[] = [...agentProcessing.entries()]
    .map(([agentId, counts]) => ({
      name: userLabel(agentId),
      total: grandTotal(counts),
      qualified: counts.qualified,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  return {
    date_range: { start: startDate, end: endDate },
    summary,
    charts: {
      qa_auditor_performance: qaAuditorPerformance,
      daily_lead_volume: dailyLeadVolume,
      agent_lead_processing: agentLeadProcessing,
    },
    tables: {
      agent_daily: agentDaily,
      agent_consolidated: agentConsolidated,
      qa_auditor_detail: qaAuditorDetail,
      qa_auditor_consolidated: qaAuditorConsolidated,
    },
  };
}

export function buildQaUserMaps(
  qaUsers: Array<{ id: string; full_name: string | null; email: string | null }>,
  label: (u: { id: string; full_name: string | null; email: string | null }) => string
) {
  const qaIds = new Set(qaUsers.map((q) => q.id));
  const qaRefs: QaUserRef[] = qaUsers.map((q) => ({
    id: q.id,
    full_name: q.full_name,
    email: q.email,
  }));
  const qaNameToId = buildQaNameToIdMap(qaRefs, label);
  return { qaIds, qaNameToId };
}
