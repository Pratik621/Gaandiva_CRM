import type { SupabaseClient } from "@supabase/supabase-js";
import { isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import {
  isAgentRole,
  type TeamMember,
} from "@/lib/tl/team-hierarchy";
import { POSTGREST_PAGE_SIZE } from "@/lib/supabase/in-chunks";

export type TransferMode = "all" | "campaign" | "selected";

export type TransferPreviewCampaign = {
  campaign_id: string;
  campaign_name: string;
  lead_count: number;
};

export type TransferAgentOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  agent_code: string | null;
  status: string;
  lead_count: number;
};

type UserWithRoles = {
  id: string;
  full_name: string | null;
  email: string | null;
  agent_code: string | null;
  status: string;
  reporting_manager_id: string | null;
  user_roles: { roles: { name: string } | null }[] | null;
};

function userHasAgentRole(user: UserWithRoles): boolean {
  return (user.user_roles ?? []).some((ur) => isAgentRole(ur.roles?.name));
}

/**
 * Build TL team membership including inactive agents (for lead transfer).
 */
export function getAgentsUnderTl(
  users: UserWithRoles[],
  campaignTlByCampaign: Map<string, Set<string>>,
  assignments: { campaign_id: string; agent_id: string }[],
  tlId: string
): TeamMember[] {
  const hierarchy = buildTeamHierarchyForTransfer(users, campaignTlByCampaign, assignments);
  const node = hierarchy.team_leaders.find((tl) => tl.id === tlId);
  return node?.agents ?? [];
}

function buildCampaignTlMapping(
  campaigns: { id: string; assigned_team_leader_id: string | null }[],
  junctionRows: { campaign_id: string; team_leader_id: string }[]
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  for (const c of campaigns) {
    const set = new Set<string>();
    if (c.assigned_team_leader_id) set.add(c.assigned_team_leader_id);
    map.set(c.id, set);
  }

  for (const row of junctionRows) {
    if (!row.campaign_id || !row.team_leader_id) continue;
    if (!map.has(row.campaign_id)) map.set(row.campaign_id, new Set());
    map.get(row.campaign_id)!.add(row.team_leader_id);
  }

  return map;
}

function buildTeamHierarchyForTransfer(
  users: UserWithRoles[],
  campaignTlByCampaign: Map<string, Set<string>>,
  assignments: { campaign_id: string; agent_id: string }[]
) {
  const allAgents = users.filter((u) => userHasAgentRole(u));
  const teamLeaders = users.filter((u) =>
    (u.user_roles ?? []).some((ur) => isCampaignTeamLeaderRole(ur.roles?.name))
  );
  const tlIdSet = new Set(teamLeaders.map((tl) => tl.id));

  const agentsByTlFromCampaigns = new Map<string, Set<string>>();
  for (const row of assignments) {
    const tlIds = campaignTlByCampaign.get(row.campaign_id);
    if (!tlIds) continue;
    for (const tlId of tlIds) {
      if (!tlIdSet.has(tlId)) continue;
      if (!agentsByTlFromCampaigns.has(tlId)) {
        agentsByTlFromCampaigns.set(tlId, new Set());
      }
      agentsByTlFromCampaigns.get(tlId)!.add(row.agent_id);
    }
  }

  const agentById = new Map(allAgents.map((a) => [a.id, a]));
  const reportingManagerTlByAgent = new Map<string, string>();
  for (const agent of allAgents) {
    if (agent.reporting_manager_id) {
      reportingManagerTlByAgent.set(agent.id, agent.reporting_manager_id);
    }
  }

  const team_leader_nodes = teamLeaders.map((tl) => {
    const agentIdSet = new Set<string>();

    for (const agent of allAgents) {
      if (agent.reporting_manager_id === tl.id) {
        agentIdSet.add(agent.id);
      }
    }

    for (const agentId of agentsByTlFromCampaigns.get(tl.id) ?? []) {
      if (!reportingManagerTlByAgent.has(agentId)) {
        agentIdSet.add(agentId);
      }
    }

    const tlAgents: TeamMember[] = [...agentIdSet]
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
      id: tl.id,
      full_name: tl.full_name,
      email: tl.email,
      agents: tlAgents,
      agent_count: tlAgents.length,
      campaign_count: 0,
    };
  });

  return { team_leaders: team_leader_nodes };
}

export function agentBelongsToTl(
  agentId: string,
  tlId: string,
  agentsUnderTl: TeamMember[]
): boolean {
  return agentsUnderTl.some((a) => a.id === agentId);
}

export async function fetchTeamContext(
  admin: SupabaseClient,
  orgId: string
): Promise<{
  users: UserWithRoles[];
  campaignTlByCampaign: Map<string, Set<string>>;
  assignments: { campaign_id: string; agent_id: string }[];
}> {
  const [usersRes, campaignsRes] = await Promise.all([
    admin
      .from("users")
      .select(
        "id, full_name, email, agent_code, status, reporting_manager_id, user_roles(roles(name))"
      )
      .eq("organization_id", orgId)
      .order("full_name"),
    admin
      .from("campaigns")
      .select("id, assigned_team_leader_id")
      .eq("organization_id", orgId),
  ]);

  if (usersRes.error) throw new Error(usersRes.error.message);
  if (campaignsRes.error) throw new Error(campaignsRes.error.message);

  const campaignList = (campaignsRes.data ?? []) as {
    id: string;
    assigned_team_leader_id: string | null;
  }[];

  // Org-scoped + paginated — never `.in(campaign_id, hundreds)` (HTTP header overflow).
  const [junctionRows, assignments] = await Promise.all([
    fetchActiveRowsByOrg<{ campaign_id: string; team_leader_id: string }>(
      admin,
      "campaign_team_leader_assignments",
      "campaign_id, team_leader_id",
      orgId
    ),
    fetchActiveRowsByOrg<{ campaign_id: string; agent_id: string }>(
      admin,
      "campaign_assignments",
      "campaign_id, agent_id",
      orgId
    ),
  ]);

  const campaignTlByCampaign = buildCampaignTlMapping(campaignList, junctionRows);

  return {
    users: (usersRes.data ?? []) as unknown as UserWithRoles[],
    campaignTlByCampaign,
    assignments,
  };
}

async function fetchActiveRowsByOrg<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  table: "campaign_assignments" | "campaign_team_leader_assignments",
  select: string,
  orgId: string
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from(table)
      .select(select)
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("assigned_at", { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as T[];
    all.push(...page);
    if (page.length < POSTGREST_PAGE_SIZE) break;
    offset += POSTGREST_PAGE_SIZE;
  }
  return all;
}

export async function countLeadsForAgent(
  admin: SupabaseClient,
  orgId: string,
  agentId: string,
  campaignId?: string
): Promise<number> {
  let query = admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("assigned_agent_id", agentId);

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function fetchTransferPreview(
  admin: SupabaseClient,
  orgId: string,
  fromAgentId: string
): Promise<{ total_leads: number; campaigns: TransferPreviewCampaign[] }> {
  const { data: leadRows, error } = await admin
    .from("leads")
    .select("id, campaign_id, campaigns(name)")
    .eq("organization_id", orgId)
    .eq("assigned_agent_id", fromAgentId);

  if (error) throw new Error(error.message);

  type LeadPreviewRow = {
    id: string;
    campaign_id: string;
    campaigns: { name: string | null } | { name: string | null }[] | null;
  };

  const rows = (leadRows ?? []) as unknown as LeadPreviewRow[];

  const byCampaign = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const existing = byCampaign.get(row.campaign_id);
    const joined = row.campaigns;
    const campaign = Array.isArray(joined) ? joined[0] : joined;
    const name = campaign?.name?.trim() || "Unknown Campaign";
    if (existing) {
      existing.count += 1;
    } else {
      byCampaign.set(row.campaign_id, { name, count: 1 });
    }
  }

  const campaigns: TransferPreviewCampaign[] = [...byCampaign.entries()]
    .map(([campaign_id, { name, count }]) => ({
      campaign_id,
      campaign_name: name,
      lead_count: count,
    }))
    .sort((a, b) => a.campaign_name.localeCompare(b.campaign_name));

  return { total_leads: rows.length, campaigns };
}

export function displayAgentName(agent: {
  full_name: string | null;
  email: string | null;
  agent_code?: string | null;
}): string {
  const name = agent.full_name?.trim() || agent.email?.trim() || "Unknown";
  const code = agent.agent_code?.trim();
  return code ? `${name} (${code})` : name;
}
