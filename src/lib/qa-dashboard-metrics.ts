import dayjs from "dayjs";
import {
  countAuditedLeads,
  countDisqualifiedLeads,
  countPendingAuditLeads,
  countQualifiedLeads,
  isLeadAudited,
} from "@/lib/qa-lead-audit";

export type QaDashboardLead = {
  qa_status?: string | null;
  created_at?: string | null;
  qa_audited_at?: string | null;
  audit_date?: string | null;
};

export type QaDashboardCampaign = {
  id: string;
  name?: string | null;
  campaign_code?: string | null;
  status?: string | null;
  leads?: QaDashboardLead[];
};

export type QaPipelineSlice = { name: string; value: number; color: string };

export type QaCampaignStatusBar = { status: string; label: string; count: number; color: string };

export type QaPendingCampaignBar = {
  id: string;
  name: string;
  pending: number;
  total: number;
};

export type QaActivityDay = {
  date: string;
  label: string;
  uploaded: number;
  audited: number;
};

export type QaDashboardMetrics = {
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
  totalAudited: number;
  totalQualified: number;
  totalDisqualified: number;
  pendingAudit: number;
  auditRatePct: number;
  qualifiedRatePct: number;
  pipelineSlices: QaPipelineSlice[];
  campaignStatusBars: QaCampaignStatusBar[];
  topPendingCampaigns: QaPendingCampaignBar[];
  activityTrend: QaActivityDay[];
};

const CAMPAIGN_STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "#52c41a" },
  paused: { label: "Paused", color: "#f59e0b" },
  draft: { label: "Draft", color: "#6b7280" },
  completed: { label: "Completed", color: "#16a34a" },
};

function auditDayKey(lead: QaDashboardLead): string | null {
  const at = lead.qa_audited_at?.trim() || lead.audit_date?.trim();
  if (!at) return null;
  const d = dayjs(at);
  return d.isValid() ? d.format("YYYY-MM-DD") : null;
}

function flattenLeads(campaigns: QaDashboardCampaign[]): QaDashboardLead[] {
  return campaigns.flatMap((c) => c.leads ?? []);
}

export function computeQaDashboardMetrics(
  campaigns: QaDashboardCampaign[],
  summary?: {
    total_leads?: number;
    total_audited?: number;
    pending_audit?: number;
    total_qualified?: number;
    total_disqualified?: number;
  }
): QaDashboardMetrics {
  const allLeads = flattenLeads(campaigns);

  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const totalLeads = summary?.total_leads ?? allLeads.length;
  const totalAudited = summary?.total_audited ?? countAuditedLeads(allLeads);
  const pendingAudit = summary?.pending_audit ?? countPendingAuditLeads(allLeads);
  const totalQualified = summary?.total_qualified ?? countQualifiedLeads(allLeads);
  const totalDisqualified = summary?.total_disqualified ?? countDisqualifiedLeads(allLeads);

  const pipelineSlices: QaPipelineSlice[] = [
    { name: "Pending", value: pendingAudit, color: "#f59e0b" },
    { name: "Qualified", value: totalQualified, color: "#52c41a" },
    { name: "Disqualified", value: totalDisqualified, color: "#ef4444" },
  ].filter((s) => s.value > 0);

  const statusCounts = new Map<string, number>();
  for (const c of campaigns) {
    const key = (c.status ?? "unknown").toLowerCase();
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }

  const campaignStatusBars: QaCampaignStatusBar[] = ["active", "paused", "draft", "completed"]
    .map((status) => ({
      status,
      label: CAMPAIGN_STATUS_META[status]?.label ?? status,
      count: statusCounts.get(status) ?? 0,
      color: CAMPAIGN_STATUS_META[status]?.color ?? "#d1d5db",
    }))
    .filter((row) => row.count > 0);

  const topPendingCampaigns: QaPendingCampaignBar[] = campaigns
    .map((c) => {
      const leads = c.leads ?? [];
      const pending = countPendingAuditLeads(leads);
      return {
        id: c.id,
        name: c.campaign_code?.trim() || c.name?.trim() || `Campaign ${c.id.slice(0, 8)}`,
        pending,
        total: leads.length,
      };
    })
    .filter((c) => c.pending > 0)
    .sort((a, b) => b.pending - a.pending || b.total - a.total)
    .slice(0, 8);

  const activityTrend: QaActivityDay[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = dayjs().subtract(i, "day");
    const key = d.format("YYYY-MM-DD");
    let uploaded = 0;
    let audited = 0;
    for (const lead of allLeads) {
      if (lead.created_at && dayjs(lead.created_at).format("YYYY-MM-DD") === key) uploaded++;
      if (isLeadAudited(lead.qa_status)) {
        const auditKey = auditDayKey(lead);
        if (auditKey === key) audited++;
      }
    }
    activityTrend.push({
      date: key,
      label: d.format("DD MMM"),
      uploaded,
      audited,
    });
  }

  return {
    totalCampaigns,
    activeCampaigns,
    totalLeads,
    totalAudited,
    totalQualified,
    totalDisqualified,
    pendingAudit,
    auditRatePct: totalLeads > 0 ? Math.round((totalAudited / totalLeads) * 100) : 0,
    qualifiedRatePct: totalAudited > 0 ? Math.round((totalQualified / totalAudited) * 100) : 0,
    pipelineSlices,
    campaignStatusBars,
    topPendingCampaigns,
    activityTrend,
  };
}
