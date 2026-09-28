import type { SupabaseClient } from "@supabase/supabase-js";
import { applyScoredLeadTaggingFilter } from "@/lib/lead-tagging";
import {
  countDisqualifiedLeads,
  countPendingAuditLeads,
  countQualifiedLeads,
  isLeadDisqualified,
  isLeadPendingAudit,
  isLeadQualified,
} from "@/lib/qa-lead-audit";
import { countBillableLeads } from "@/lib/leads/billable-status";
import { fetchAllByIdChunks } from "@/lib/supabase/in-chunks";

const MISTL_DASHBOARD_LEAD_SELECT =
  "id, status, qa_status, assigned_agent_id, created_at, campaign_id, call_back, lead_tagging, billable_status";

export type MistlDashboardLeadRow = {
  id: string;
  status: string;
  qa_status: string | null;
  assigned_agent_id: string | null;
  created_at: string;
  campaign_id: string;
  call_back: string | null;
  lead_tagging: string | null;
  billable_status: string | null;
};

export type MistlDashboardStats = {
  totalCampaigns: number;
  totalLeadsUploaded: number;
  leadsAssignedToAgents: number;
  pendingLeads: number;
  completedLeads: number;
  qaApprovedLeads: number;
  qaRejectedLeads: number;
  callBackLeads: number;
  billableLeads: number;
};

export type MistlCampaignPerformanceRow = {
  id: string;
  name: string;
  campaign_code: string | null;
  totalLeads: number;
  qualifiedLeads: number;
};

export type MistlLeadStatusSlice = {
  status: string;
  count: number;
};

export type MistlDailyUploadPoint = {
  date: string;
  count: number;
};

export type MistlAgentDistributionRow = {
  agent_id: string | null;
  agent_name: string;
  totalLeads: number;
  assignedLeads: number;
  pendingLeads: number;
  completedLeads: number;
  qaApprovedLeads: number;
  qaRejectedLeads: number;
  callBackLeads: number;
};

const COMPLETED_STATUSES = new Set(["closed_won", "closed_lost", "completed"]);

export function isCallBackLead(lead: {
  call_back?: string | null;
  lead_tagging?: string | null;
}): boolean {
  const tagging = String(lead.lead_tagging ?? "").trim().toLowerCase();
  if (tagging === "call back") return true;
  return String(lead.call_back ?? "").trim().length > 0;
}

/** Paginated + chunked fetch — avoids URL/header overflow on large campaign ID lists. */
export async function fetchMistlDashboardLeads(
  admin: SupabaseClient,
  orgId: string,
  campaignIds: string[]
): Promise<MistlDashboardLeadRow[]> {
  if (campaignIds.length === 0) return [];

  return fetchAllByIdChunks<MistlDashboardLeadRow>(
    campaignIds,
    async (idChunk, from, to) => {
      const { data, error } = await applyScoredLeadTaggingFilter(
        admin
          .from("leads")
          .select(MISTL_DASHBOARD_LEAD_SELECT)
          .eq("organization_id", orgId)
          .in("campaign_id", idChunk)
          .order("created_at", { ascending: true })
      ).range(from, to);

      return {
        data: (data as MistlDashboardLeadRow[] | null) ?? null,
        error: error ? { message: error.message } : null,
      };
    }
  );
}

export function buildMistlDashboardAggregates(
  leads: MistlDashboardLeadRow[],
  campaigns: { id: string; name: string; campaign_code: string | null }[]
): {
  stats: MistlDashboardStats;
  leadStatus: MistlLeadStatusSlice[];
  campaignPerformance: MistlCampaignPerformanceRow[];
  dailyUploads: MistlDailyUploadPoint[];
  agentDistribution: Omit<MistlAgentDistributionRow, "agent_name">[];
} {
  const totalLeadsUploaded = leads.length;
  const leadsAssignedToAgents = leads.filter((l) => !!l.assigned_agent_id).length;
  const completedLeads = leads.filter((l) =>
    COMPLETED_STATUSES.has(String(l.status || "").toLowerCase())
  ).length;
  const qaApprovedLeads = countQualifiedLeads(leads);
  const pendingLeads = countPendingAuditLeads(leads);
  const qaRejectedLeads = countDisqualifiedLeads(leads);
  const callBackLeads = leads.filter((l) => isCallBackLead(l)).length;
  const billableLeads = countBillableLeads(leads);

  const leadStatusMap = new Map<string, number>();
  const agentMap = new Map<
    string,
    Omit<MistlAgentDistributionRow, "agent_name" | "agent_id"> & { agent_id: string | null }
  >();

  const pushAgent = (agentId: string | null) => {
    const key = agentId || "__unassigned__";
    if (!agentMap.has(key)) {
      agentMap.set(key, {
        agent_id: agentId,
        totalLeads: 0,
        assignedLeads: 0,
        pendingLeads: 0,
        completedLeads: 0,
        qaApprovedLeads: 0,
        qaRejectedLeads: 0,
        callBackLeads: 0,
      });
    }
    return agentMap.get(key)!;
  };

  for (const lead of leads) {
    const status = String(lead.status || "").toLowerCase();
    const statusKey = status || "unknown";
    leadStatusMap.set(statusKey, (leadStatusMap.get(statusKey) ?? 0) + 1);

    const agentBucket = pushAgent(lead.assigned_agent_id);
    agentBucket.totalLeads += 1;
    if (lead.assigned_agent_id) agentBucket.assignedLeads += 1;
    if (COMPLETED_STATUSES.has(status)) agentBucket.completedLeads += 1;
    if (isLeadPendingAudit(lead.qa_status)) agentBucket.pendingLeads += 1;
    if (isLeadQualified(lead.qa_status)) agentBucket.qaApprovedLeads += 1;
    else if (isLeadDisqualified(lead.qa_status)) agentBucket.qaRejectedLeads += 1;
    if (isCallBackLead(lead)) agentBucket.callBackLeads += 1;
  }

  const campaignMetaById = new Map(
    campaigns.map((c) => [c.id, { name: c.name, campaign_code: c.campaign_code ?? null }])
  );
  const campaignPerformanceMap = new Map<string, MistlCampaignPerformanceRow>();

  for (const lead of leads) {
    const key = lead.campaign_id;
    if (!campaignPerformanceMap.has(key)) {
      const meta = campaignMetaById.get(key);
      campaignPerformanceMap.set(key, {
        id: key,
        name: meta?.name ?? "Unnamed",
        campaign_code: meta?.campaign_code ?? null,
        totalLeads: 0,
        qualifiedLeads: 0,
      });
    }
    const bucket = campaignPerformanceMap.get(key)!;
    bucket.totalLeads += 1;
    if (isLeadQualified(lead.qa_status)) {
      bucket.qualifiedLeads += 1;
    }
  }

  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 13);
  const dateKey = (d: Date) => d.toISOString().slice(0, 10);

  const dailyMap = new Map<string, number>();
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dailyMap.set(dateKey(d), 0);
  }

  for (const lead of leads) {
    const key = dateKey(new Date(lead.created_at));
    if (dailyMap.has(key)) {
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
    }
  }

  return {
    stats: {
      totalCampaigns: campaigns.length,
      totalLeadsUploaded,
      leadsAssignedToAgents,
      pendingLeads,
      completedLeads,
      qaApprovedLeads,
      qaRejectedLeads,
      callBackLeads,
      billableLeads,
    },
    leadStatus: Array.from(leadStatusMap.entries()).map(([status, count]) => ({ status, count })),
    campaignPerformance: Array.from(campaignPerformanceMap.values()).sort(
      (a, b) => b.totalLeads - a.totalLeads
    ),
    dailyUploads: Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count })),
    agentDistribution: Array.from(agentMap.values()),
  };
}
