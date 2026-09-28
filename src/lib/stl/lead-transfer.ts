import type { SupabaseClient } from "@supabase/supabase-js";
import { isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import { isAgentRole, type TeamMember } from "@/lib/tl/team-hierarchy";

type UserWithRoles = {
  id: string;
  full_name: string | null;
  email: string | null;
  agent_code: string | null;
  status: string;
  reporting_manager_id: string | null;
  stl_id: string | null;
  user_roles: { roles: { name: string } | null }[] | null;
};

function userHasAgentRole(user: UserWithRoles): boolean {
  return (user.user_roles ?? []).some((ur) => isAgentRole(ur.roles?.name));
}

/**
 * Build STL team membership (agents under the STL's team leaders), including
 * inactive agents (for lead transfer). Mirrors lib/tl/lead-transfer.ts's
 * TL → agents builder one level up (STL → TL → agents), using the
 * `users.stl_id` reporting line for TL → STL and `reporting_manager_id` for
 * agent → TL.
 */
export function getAgentsUnderStl(
  users: UserWithRoles[],
  campaignStlByCampaign: Map<string, Set<string>>,
  assignments: { campaign_id: string; agent_id: string }[],
  stlId: string
): TeamMember[] {
  const hierarchy = buildTeamHierarchyForStlTransfer(users, campaignStlByCampaign, assignments);
  const node = hierarchy.stls.find((s) => s.id === stlId);
  return node?.agents ?? [];
}

function buildCampaignStlMapping(
  campaigns: { id: string; assigned_stl_id: string | null }[],
  junctionRows: { campaign_id: string; stl_id: string }[]
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  for (const c of campaigns) {
    const set = new Set<string>();
    if (c.assigned_stl_id) set.add(c.assigned_stl_id);
    map.set(c.id, set);
  }

  for (const row of junctionRows) {
    if (!row.campaign_id || !row.stl_id) continue;
    if (!map.has(row.campaign_id)) map.set(row.campaign_id, new Set());
    map.get(row.campaign_id)!.add(row.stl_id);
  }

  return map;
}

function buildTeamHierarchyForStlTransfer(
  users: UserWithRoles[],
  campaignStlByCampaign: Map<string, Set<string>>,
  assignments: { campaign_id: string; agent_id: string }[]
) {
  const allAgents = users.filter((u) => userHasAgentRole(u));
  const teamLeaders = users.filter((u) =>
    (u.user_roles ?? []).some((ur) => isCampaignTeamLeaderRole(ur.roles?.name))
  );
  const stlUsers = users.filter((u) =>
    (u.user_roles ?? []).some((ur) => isSeniorTeamLeaderRole(ur.roles?.name))
  );
  const stlIdSet = new Set(stlUsers.map((s) => s.id));

  // Team leader -> STL, via the reporting line (users.stl_id).
  const tlToStl = new Map<string, string>();
  for (const tl of teamLeaders) {
    if (tl.stl_id && stlIdSet.has(tl.stl_id)) tlToStl.set(tl.id, tl.stl_id);
  }

  // Agent -> team leader, via the reporting line (users.reporting_manager_id).
  const agentToTl = new Map<string, string>();
  for (const agent of allAgents) {
    if (agent.reporting_manager_id) agentToTl.set(agent.id, agent.reporting_manager_id);
  }

  const agentsByStlFromCampaigns = new Map<string, Set<string>>();
  for (const row of assignments) {
    const stlIds = campaignStlByCampaign.get(row.campaign_id);
    if (!stlIds) continue;
    for (const stlId of stlIds) {
      if (!stlIdSet.has(stlId)) continue;
      if (!agentsByStlFromCampaigns.has(stlId)) {
        agentsByStlFromCampaigns.set(stlId, new Set());
      }
      agentsByStlFromCampaigns.get(stlId)!.add(row.agent_id);
    }
  }

  const agentById = new Map(allAgents.map((a) => [a.id, a]));

  const stl_nodes = stlUsers.map((stl) => {
    const agentIdSet = new Set<string>();

    // 1. Direct reporting line — agents whose TL reports to this STL.
    for (const agent of allAgents) {
      const tlId = agentToTl.get(agent.id);
      if (tlId && tlToStl.get(tlId) === stl.id) {
        agentIdSet.add(agent.id);
      }
    }

    // 2. Campaign membership — only for agents whose TL does not already
    //    place them under a (possibly different) STL via the reporting line.
    for (const agentId of agentsByStlFromCampaigns.get(stl.id) ?? []) {
      const tlId = agentToTl.get(agentId);
      const coveredByReportingLine = Boolean(tlId && tlToStl.has(tlId));
      if (!coveredByReportingLine) {
        agentIdSet.add(agentId);
      }
    }

    const stlAgents: TeamMember[] = [...agentIdSet]
      .map((id) => agentById.get(id))
      .filter((a): a is UserWithRoles => Boolean(a))
      .map((a) => ({
        id: a.id,
        full_name: a.full_name,
        email: a.email,
        agent_code: a.agent_code,
        status: a.status,
      }));

    return {
      id: stl.id,
      full_name: stl.full_name,
      email: stl.email,
      agents: stlAgents,
      agent_count: stlAgents.length,
      campaign_count: 0,
    };
  });

  return { stls: stl_nodes };
}

export function agentBelongsToStl(
  agentId: string,
  stlId: string,
  agentsUnderStl: TeamMember[]
): boolean {
  return agentsUnderStl.some((a) => a.id === agentId);
}

export async function fetchStlTeamContext(
  admin: SupabaseClient,
  orgId: string
): Promise<{
  users: UserWithRoles[];
  campaignStlByCampaign: Map<string, Set<string>>;
  assignments: { campaign_id: string; agent_id: string }[];
}> {
  const [usersRes, campaignsRes] = await Promise.all([
    admin
      .from("users")
      .select(
        "id, full_name, email, agent_code, status, reporting_manager_id, stl_id, user_roles(roles(name))"
      )
      .eq("organization_id", orgId)
      .order("full_name"),
    admin
      .from("campaigns")
      .select("id, assigned_stl_id")
      .eq("organization_id", orgId),
  ]);

  if (usersRes.error) throw new Error(usersRes.error.message);
  if (campaignsRes.error) throw new Error(campaignsRes.error.message);

  const campaignList = (campaignsRes.data ?? []) as {
    id: string;
    assigned_stl_id: string | null;
  }[];
  const campaignIds = campaignList.map((c) => c.id);

  let junctionRows: { campaign_id: string; stl_id: string }[] = [];
  let assignments: { campaign_id: string; agent_id: string }[] = [];

  if (campaignIds.length > 0) {
    const [junctionRes, assignRes] = await Promise.all([
      admin
        .from("campaign_stl_assignments")
        .select("campaign_id, stl_id")
        .in("campaign_id", campaignIds)
        .eq("is_active", true),
      admin
        .from("campaign_assignments")
        .select("campaign_id, agent_id")
        .in("campaign_id", campaignIds)
        .eq("is_active", true),
    ]);

    if (junctionRes.error) throw new Error(junctionRes.error.message);
    if (assignRes.error) throw new Error(assignRes.error.message);

    junctionRows = (junctionRes.data ?? []) as {
      campaign_id: string;
      stl_id: string;
    }[];
    assignments = (assignRes.data ?? []) as { campaign_id: string; agent_id: string }[];
  }

  const campaignStlByCampaign = buildCampaignStlMapping(campaignList, junctionRows);

  return {
    users: (usersRes.data ?? []) as unknown as UserWithRoles[],
    campaignStlByCampaign,
    assignments,
  };
}
