import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTeamHierarchy } from "@/lib/tl/team-hierarchy";
import { buildSTLHierarchy } from "@/lib/stl/team-hierarchy";
import { fetchCampaignIdsForSTL } from "@/lib/campaign/stl-assignments";
import { chunkArray } from "@/lib/postgrest-filter";

const LEADS_PAGE_SIZE = 1000;

export type STLCampaignStats = {
  campaign_id: string;
  campaign_name: string;
  campaign_code: string | null;
  status: string;
  agents_count: number;
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

type OrgUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  agent_code: string | null;
  status: string;
  reporting_manager_id: string | null;
  stl_id: string | null;
  user_roles: { roles: { name: string } | null }[] | null;
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

async function fetchLeadRows(
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

  for (const idBatch of chunkArray(params.campaignIds)) {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin
        .from("leads")
        .select("campaign_id, assigned_agent_id, created_by, qa_status, delivery_status")
        .eq("organization_id", params.orgId)
        .in("campaign_id", idBatch)
        .gte("created_at", params.startUtc)
        .lte("created_at", params.endUtc)
        .order("created_at", { ascending: true })
        .range(offset, offset + LEADS_PAGE_SIZE - 1);

      if (error) throw error;
      const rows = (data ?? []) as LeadRow[];
      all.push(...rows);
      if (rows.length < LEADS_PAGE_SIZE) break;
      offset += LEADS_PAGE_SIZE;
    }
  }

  return all;
}

/**
 * STL profile stats: mirrors lib/tl/team-leader-profile.ts's fetchTeamLeaderCampaignStats
 * one level up — STL → Team Leaders (via buildSTLHierarchy) → agents (via buildTeamHierarchy),
 * scoped to the campaigns assigned to this STL (assigned_stl_id + campaign_stl_assignments).
 */
export async function fetchSTLCampaignStats(
  admin: SupabaseClient,
  params: {
    orgId: string;
    stlId: string;
    startUtc: string;
    endUtc: string;
    supabase: SupabaseClient;
  }
): Promise<{
  team_leader_count: number;
  agent_count: number;
  campaigns: STLCampaignStats[];
}> {
  const [{ data: orgUsers, error: usersError }, { data: campaigns, error: campaignsError }] =
    await Promise.all([
      admin
        .from("users")
        .select(
          "id, full_name, email, agent_code, status, reporting_manager_id, stl_id, user_roles(roles(name))"
        )
        .eq("organization_id", params.orgId)
        .eq("status", "active"),
      admin
        .from("campaigns")
        .select("id, name, campaign_code, status, assigned_team_leader_id, assigned_stl_id")
        .eq("organization_id", params.orgId),
    ]);

  if (usersError) throw usersError;
  if (campaignsError) throw campaignsError;

  const users = (orgUsers ?? []) as unknown as OrgUser[];
  type CampaignRow = {
    id: string;
    name: string;
    campaign_code: string | null;
    status: string;
    assigned_team_leader_id: string | null;
    assigned_stl_id: string | null;
  };
  const allCampaigns = (campaigns ?? []) as CampaignRow[];
  const allCampIds = allCampaigns.map((c) => c.id);

  let allCampAssignments: { campaign_id: string; agent_id: string }[] = [];
  if (allCampIds.length > 0) {
    for (const idBatch of chunkArray(allCampIds)) {
      const { data: caRows, error: caError } = await admin
        .from("campaign_assignments")
        .select("campaign_id, agent_id")
        .in("campaign_id", idBatch)
        .eq("is_active", true);
      if (caError) throw caError;
      allCampAssignments.push(
        ...((caRows ?? []) as { campaign_id: string; agent_id: string }[])
      );
    }
  }

  // STL -> Team Leaders (one level).
  const stlHierarchy = buildSTLHierarchy(
    users as Parameters<typeof buildSTLHierarchy>[0],
    allCampaigns
  );
  const stlNode = stlHierarchy.stls.find((s) => s.id === params.stlId);
  const stlTlIds = new Set((stlNode?.team_leaders ?? []).map((tl) => tl.id));

  // Team Leader -> agents (generic hierarchy builder), filtered down to this STL's TLs.
  const tlHierarchy = buildTeamHierarchy(
    users as Parameters<typeof buildTeamHierarchy>[0],
    allCampaigns,
    allCampAssignments
  );
  const stlAgentIds = new Set<string>();
  for (const tlNode of tlHierarchy.team_leaders) {
    if (!stlTlIds.has(tlNode.id)) continue;
    for (const agent of tlNode.agents) stlAgentIds.add(agent.id);
  }

  const junctionIds = await fetchCampaignIdsForSTL(params.supabase, params.stlId, params.orgId);
  const stlCampaignIds = [
    ...new Set([
      ...allCampaigns.filter((c) => c.assigned_stl_id === params.stlId).map((c) => c.id),
      ...junctionIds,
    ]),
  ];

  if (stlCampaignIds.length === 0) {
    return { team_leader_count: stlTlIds.size, agent_count: stlAgentIds.size, campaigns: [] };
  }

  const campaignById = new Map(
    allCampaigns.filter((c) => stlCampaignIds.includes(c.id)).map((c) => [c.id, c])
  );

  const agentsByCampaign = new Map<string, Set<string>>();
  for (const row of allCampAssignments) {
    if (!stlCampaignIds.includes(row.campaign_id)) continue;
    if (!stlAgentIds.has(row.agent_id)) continue;
    if (!agentsByCampaign.has(row.campaign_id)) {
      agentsByCampaign.set(row.campaign_id, new Set());
    }
    agentsByCampaign.get(row.campaign_id)!.add(row.agent_id);
  }

  const statsByCampaign = new Map<
    string,
    { total: number; qualified: number; disqualified: number; delivered: number }
  >();
  for (const campaignId of stlCampaignIds) {
    statsByCampaign.set(campaignId, { total: 0, qualified: 0, disqualified: 0, delivered: 0 });
  }

  const leads = await fetchLeadRows(admin, {
    orgId: params.orgId,
    campaignIds: stlCampaignIds,
    startUtc: params.startUtc,
    endUtc: params.endUtc,
  });

  for (const lead of leads) {
    const agId = resolveLeadAgentId(lead);
    if (!agId || !stlAgentIds.has(agId)) continue;
    const bucket = statsByCampaign.get(lead.campaign_id);
    if (!bucket) continue;

    bucket.total += 1;
    if (isQualifiedQa(lead.qa_status)) bucket.qualified += 1;
    if (isDisqualifiedQa(lead.qa_status)) bucket.disqualified += 1;
    if (isDeliveredLead(lead.delivery_status)) bucket.delivered += 1;
  }

  const campaignsOut: STLCampaignStats[] = stlCampaignIds
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
        agents_count: agentsByCampaign.get(campaignId)?.size ?? 0,
        total_leads: stats.total,
        qualified_leads: stats.qualified,
        disqualified_leads: stats.disqualified,
        delivered_leads: stats.delivered,
      };
    })
    .sort((a, b) => b.total_leads - a.total_leads);

  return {
    team_leader_count: stlTlIds.size,
    agent_count: stlAgentIds.size,
    campaigns: campaignsOut,
  };
}
