import type { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import {
  countDisqualifiedLeads,
  countPendingAuditLeads,
  countQualifiedLeads,
  isLeadDisqualified,
  isLeadPendingAudit,
  isLeadQualified,
} from "@/lib/qa-lead-audit";
import { countBillableLeads } from "@/lib/leads/billable-status";

const TEAM_LEADS_PAGE_SIZE = 1000;

export type AgentLeadRow = {
  campaign_id: string;
  qa_status?: string | null;
  billable_status?: string | null;
  created_at?: string | null;
};

export type AgentCampaignBase = {
  id: string;
  campaign_code?: string | null;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  total_allocation?: number | null;
};

export type AgentLeadTrendDay = {
  date: string;
  label: string;
  total: number;
  pending: number;
  qualified: number;
  disqualified: number;
};

export type AgentCampaignLeadBar = {
  id: string;
  name: string;
  uploads: number;
  qualified: number;
  pending: number;
  disqualified: number;
};

export type CampaignLeadStats = {
  total_uploaded: number;
  qualified: number;
};

export type AgentCompletionPrediction = {
  id: string;
  campaign_name: string;
  campaign_code: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  total_allocation: number;
  /** Qualified leads on campaign (all agents) — drives progress vs allocation. */
  campaign_qualified: number;
  /** All uploads on campaign (all agents). */
  campaign_total_uploaded: number;
  agent_uploaded: number;
  agent_qualified: number;
  remaining_qualified: number;
  progress_pct: number;
  days_left: number | null;
  required_per_day: number | null;
  is_complete: boolean;
  is_overdue: boolean;
  is_nearing: boolean;
};

export function tallyCampaignLeadStats(leads: AgentLeadRow[]): Record<string, CampaignLeadStats> {
  const out: Record<string, CampaignLeadStats> = {};
  for (const lead of leads) {
    if (!out[lead.campaign_id]) {
      out[lead.campaign_id] = { total_uploaded: 0, qualified: 0 };
    }
    out[lead.campaign_id].total_uploaded += 1;
    if (isLeadQualified(lead.qa_status)) {
      out[lead.campaign_id].qualified += 1;
    }
  }
  return out;
}

export function tallyAgentLeadStats(leads: AgentLeadRow[]): Record<string, CampaignLeadStats> {
  return tallyCampaignLeadStats(leads);
}

/**
 * Campaign-wide upload/qualified counts (all agents). Uses service-role client because
 * agent RLS only allows SELECT on rows where assigned_agent_id = auth.uid().
 */
export async function fetchCampaignTeamLeadStats(
  admin: SupabaseClient,
  orgId: string,
  campaignIds: string[]
): Promise<Record<string, CampaignLeadStats>> {
  if (campaignIds.length === 0) return {};

  const all: AgentLeadRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from("leads")
      .select("campaign_id, qa_status")
      .eq("organization_id", orgId)
      .in("campaign_id", campaignIds)
      .order("created_at", { ascending: true })
      .range(offset, offset + TEAM_LEADS_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const chunk = (data ?? []) as AgentLeadRow[];
    all.push(...chunk);
    if (chunk.length < TEAM_LEADS_PAGE_SIZE) break;
    offset += TEAM_LEADS_PAGE_SIZE;
  }

  return tallyCampaignLeadStats(all);
}

function daysBetween(start: string, end: string): number {
  return Math.max(0, dayjs(end).startOf("day").diff(dayjs(start).startOf("day"), "day"));
}

export function buildAgentLeadTrend(leads: AgentLeadRow[], days = 14): AgentLeadTrendDay[] {
  const out: AgentLeadTrendDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayjs().subtract(i, "day");
    const key = d.format("YYYY-MM-DD");
    let total = 0;
    let pending = 0;
    let qualified = 0;
    let disqualified = 0;

    for (const lead of leads) {
      if (!lead.created_at || dayjs(lead.created_at).format("YYYY-MM-DD") !== key) continue;
      total++;
      if (isLeadPendingAudit(lead.qa_status)) pending++;
      else if (isLeadQualified(lead.qa_status)) qualified++;
      else if (isLeadDisqualified(lead.qa_status)) disqualified++;
    }

    out.push({
      date: key,
      label: d.format("DD MMM"),
      total,
      pending,
      qualified,
      disqualified,
    });
  }
  return out;
}

export function buildAgentCampaignLeadBars(
  campaigns: AgentCampaignBase[],
  agentLeads: AgentLeadRow[]
): AgentCampaignLeadBar[] {
  const byCampaign = new Map<
    string,
    { uploads: number; qualified: number; pending: number; disqualified: number }
  >();

  for (const lead of agentLeads) {
    if (!byCampaign.has(lead.campaign_id)) {
      byCampaign.set(lead.campaign_id, { uploads: 0, qualified: 0, pending: 0, disqualified: 0 });
    }
    const b = byCampaign.get(lead.campaign_id)!;
    b.uploads++;
    if (isLeadPendingAudit(lead.qa_status)) b.pending++;
    else if (isLeadQualified(lead.qa_status)) b.qualified++;
    else if (isLeadDisqualified(lead.qa_status)) b.disqualified++;
  }

  return campaigns
    .map((c) => {
      const stats = byCampaign.get(c.id) ?? {
        uploads: 0,
        qualified: 0,
        pending: 0,
        disqualified: 0,
      };
      const label = c.campaign_code?.trim() || c.name?.trim() || `Campaign ${c.id.slice(0, 8)}`;
      return {
        id: c.id,
        name: label.length > 18 ? `${label.slice(0, 17)}…` : label,
        ...stats,
      };
    })
    .filter((c) => c.uploads > 0)
    .sort((a, b) => b.uploads - a.uploads)
    .slice(0, 10);
}

export function buildAgentCompletionPredictions(
  campaigns: AgentCampaignBase[],
  agentLeads: AgentLeadRow[],
  campaignStats: Record<string, CampaignLeadStats>,
  today = dayjs().format("YYYY-MM-DD")
): AgentCompletionPrediction[] {
  const agentStats = tallyAgentLeadStats(agentLeads);

  return campaigns
    .filter((c) => c.status === "active" || c.status === "draft")
    .map((c) => {
      const totalAllocation = Math.max(0, c.total_allocation ?? 0);
      const team = campaignStats[c.id] ?? { total_uploaded: 0, qualified: 0 };
      const mine = agentStats[c.id] ?? { total_uploaded: 0, qualified: 0 };
      const campaignQualified = team.qualified;
      const remainingQualified = Math.max(0, totalAllocation - campaignQualified);
      const progressPct =
        totalAllocation > 0
          ? Math.min(100, Math.round((campaignQualified / totalAllocation) * 100))
          : campaignQualified > 0
          ? 100
          : 0;

      const daysLeft =
        c.end_date && c.end_date >= today ? daysBetween(today, c.end_date) : c.end_date ? 0 : null;
      const isOverdue = Boolean(c.end_date && c.end_date < today && progressPct < 100);
      const isComplete = totalAllocation > 0 ? progressPct >= 100 : false;
      const isNearing = !isOverdue && !isComplete && daysLeft !== null && daysLeft <= 7;

      const requiredPerDay =
        !isComplete && daysLeft !== null && daysLeft > 0 && remainingQualified > 0
          ? Math.ceil(remainingQualified / daysLeft)
          : null;

      return {
        id: c.id,
        campaign_name: c.name,
        campaign_code: c.campaign_code ?? null,
        status: c.status,
        start_date: c.start_date,
        end_date: c.end_date,
        total_allocation: totalAllocation,
        campaign_qualified: campaignQualified,
        campaign_total_uploaded: team.total_uploaded,
        agent_uploaded: mine.total_uploaded,
        agent_qualified: mine.qualified,
        remaining_qualified: remainingQualified,
        progress_pct: progressPct,
        days_left: c.end_date ? (isOverdue ? 0 : daysLeft) : null,
        required_per_day: requiredPerDay,
        is_complete: isComplete,
        is_overdue: isOverdue,
        is_nearing: isNearing,
      };
    })
    .filter(
      (c) => c.total_allocation > 0 || c.campaign_total_uploaded > 0 || c.campaign_qualified > 0
    )
    .sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      if (a.is_nearing !== b.is_nearing) return a.is_nearing ? -1 : 1;
      return (b.required_per_day ?? 0) - (a.required_per_day ?? 0);
    });
}

export function summarizeAgentLeads(leads: AgentLeadRow[]) {
  const totalLeads = leads.length;
  const pendingLeads = countPendingAuditLeads(leads);
  const qualifiedLeads = countQualifiedLeads(leads);
  const disqualifiedLeads = countDisqualifiedLeads(leads);
  const qualifiedRatePct =
    totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;

  return { totalLeads, pendingLeads, qualifiedLeads, disqualifiedLeads, qualifiedRatePct, billableLeads: countBillableLeads(leads) };
}
