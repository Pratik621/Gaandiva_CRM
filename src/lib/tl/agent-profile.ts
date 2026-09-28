import type { SupabaseClient } from "@supabase/supabase-js";

const LEADS_PAGE_SIZE = 1000;

export type AgentCampaignStats = {
  campaign_id: string;
  campaign_name: string;
  campaign_code: string | null;
  status: string;
  total_leads: number;
  qualified_leads: number;
  disqualified_leads: number;
  delivered_leads: number;
};

type LeadRow = {
  campaign_id: string;
  assigned_agent_id: string | null;
  created_by: string | null;
  qa_status: string | null;
  delivery_status: string | null;
};

function resolveLeadAgentId(lead: {
  assigned_agent_id: string | null;
  created_by: string | null;
}): string | null {
  return lead.assigned_agent_id ?? lead.created_by ?? null;
}

function isQualifiedQa(qa: string | null | undefined): boolean {
  const q = String(qa ?? "").trim().toLowerCase();
  return q === "qualified" || q === "approved" || q === "pass";
}

function isDisqualifiedQa(qa: string | null | undefined): boolean {
  return String(qa ?? "").trim().toLowerCase() === "disqualified";
}

function isDeliveredLead(deliveryStatus: string | null | undefined): boolean {
  const ds = String(deliveryStatus ?? "").trim().toLowerCase();
  return ds === "delivered" || ds === "delivered_by_mis";
}

async function fetchAgentLeadRows(
  admin: SupabaseClient,
  params: {
    orgId: string;
    campaignIds: string[];
    startUtc: string;
    endUtc: string;
  }
): Promise<LeadRow[]> {
  if (params.campaignIds.length === 0) return [];

  const all: LeadRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from("leads")
      .select("campaign_id, assigned_agent_id, created_by, qa_status, delivery_status")
      .eq("organization_id", params.orgId)
      .in("campaign_id", params.campaignIds)
      .gte("created_at", params.startUtc)
      .lte("created_at", params.endUtc)
      .order("created_at", { ascending: true })
      .range(offset, offset + LEADS_PAGE_SIZE - 1);

    if (error) throw error;
    const chunk = (data ?? []) as LeadRow[];
    all.push(...chunk);
    if (chunk.length < LEADS_PAGE_SIZE) break;
    offset += LEADS_PAGE_SIZE;
  }

  return all;
}

export async function fetchAgentCampaignStats(
  admin: SupabaseClient,
  params: {
    orgId: string;
    agentId: string;
    startUtc: string;
    endUtc: string;
  }
): Promise<AgentCampaignStats[]> {
  const { data: assignmentRows, error: assignmentError } = await admin
    .from("campaign_assignments")
    .select("campaign_id")
    .eq("agent_id", params.agentId)
    .eq("is_active", true);

  if (assignmentError) throw assignmentError;

  const assignedCampaignIds = [
    ...new Set(
      ((assignmentRows ?? []) as { campaign_id: string }[])
        .map((row) => row.campaign_id)
        .filter(Boolean)
    ),
  ];

  if (assignedCampaignIds.length === 0) return [];

  const { data: campaigns, error: campaignsError } = await admin
    .from("campaigns")
    .select("id, name, campaign_code, status")
    .eq("organization_id", params.orgId)
    .in("id", assignedCampaignIds);

  if (campaignsError) throw campaignsError;

  type CampaignRow = {
    id: string;
    name: string;
    campaign_code: string | null;
    status: string;
  };

  const campaignRows = (campaigns ?? []) as CampaignRow[];
  const campaignById = new Map(campaignRows.map((campaign) => [campaign.id, campaign]));
  const statsByCampaign = new Map<
    string,
    { total: number; qualified: number; disqualified: number; delivered: number }
  >();

  for (const campaignId of assignedCampaignIds) {
    statsByCampaign.set(campaignId, { total: 0, qualified: 0, disqualified: 0, delivered: 0 });
  }

  const leads = await fetchAgentLeadRows(admin, {
    orgId: params.orgId,
    campaignIds: assignedCampaignIds,
    startUtc: params.startUtc,
    endUtc: params.endUtc,
  });

  for (const lead of leads) {
    if (resolveLeadAgentId(lead) !== params.agentId) continue;
    const bucket = statsByCampaign.get(lead.campaign_id);
    if (!bucket) continue;

    bucket.total += 1;
    if (isQualifiedQa(lead.qa_status)) bucket.qualified += 1;
    if (isDisqualifiedQa(lead.qa_status)) bucket.disqualified += 1;
    if (isDeliveredLead(lead.delivery_status)) bucket.delivered += 1;
  }

  return assignedCampaignIds
    .map((campaignId) => {
      const campaign = campaignById.get(campaignId);
      const stats = statsByCampaign.get(campaignId) ?? {
        total: 0,
        qualified: 0,
        disqualified: 0,
        delivered: 0,
      };

      return {
        campaign_id: campaignId,
        campaign_name: campaign?.name ?? "Unknown campaign",
        campaign_code: campaign?.campaign_code ?? null,
        status: campaign?.status ?? "unknown",
        total_leads: stats.total,
        qualified_leads: stats.qualified,
        disqualified_leads: stats.disqualified,
        delivered_leads: stats.delivered,
      };
    })
    .sort((a, b) => b.total_leads - a.total_leads);
}
