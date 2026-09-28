import { isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import type { TeamHierarchyData, TeamMember } from "@/lib/tl/team-hierarchy";

export type TeamLeaderMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  agent_code: string | null;
  status: string;
  /** Agents reporting to this Team Leader — attached by the API route (not
   *  computed here, since that needs campaign_assignments data this pure
   *  builder doesn't take). Undefined where the caller didn't merge it in. */
  agents?: TeamMember[];
  agent_count?: number;
};

export type STLNode = {
  id: string;
  full_name: string | null;
  email: string | null;
  team_leaders: TeamLeaderMember[];
  team_leader_count: number;
  campaign_count: number;
};

export type STLHierarchyStats = {
  stl_count: number;
  total_team_leaders: number;
  assigned_team_leaders: number;
  unassigned_team_leaders: number;
};

export type STLHierarchyData = {
  stls: STLNode[];
  unassigned_team_leaders: TeamLeaderMember[];
  stats: STLHierarchyStats;
};

type UserWithRoles = {
  id: string;
  full_name: string | null;
  email: string | null;
  agent_code: string | null;
  status: string;
  stl_id: string | null;
  user_roles: { roles: { name: string } | null }[] | null;
};

function userHasRole(
  user: UserWithRoles,
  predicate: (roleName: string | null | undefined) => boolean
): boolean {
  const ur = user.user_roles;
  if (!ur || !Array.isArray(ur)) return false;
  return ur.some((r) => predicate(r.roles?.name));
}

function displayLabel(user: { full_name: string | null; email: string | null; agent_code?: string | null }): string {
  const name = user.full_name?.trim() || user.email?.trim() || "Unknown";
  const code = user.agent_code?.trim();
  return code ? `${name} (${code})` : name;
}

export function getTeamLeaderMemberLabel(member: TeamLeaderMember): string {
  return displayLabel(member);
}

export function getSTLLabel(stl: Pick<STLNode, "full_name" | "email">): string {
  return displayLabel(stl);
}

/**
 * Build STL → Team Leaders tree from the `users.stl_id` reporting line and
 * STL campaign assignments. Mirrors lib/tl/team-hierarchy.ts's TL → agents
 * builder one level up.
 */
export function buildSTLHierarchy(
  users: UserWithRoles[],
  campaigns: { id: string; assigned_stl_id: string | null }[]
): STLHierarchyData {
  const activeUsers = users.filter((u) => u.status === "active");

  const stlUsers = activeUsers.filter((u) => userHasRole(u, isSeniorTeamLeaderRole));
  const teamLeaders = activeUsers.filter((u) => userHasRole(u, isCampaignTeamLeaderRole));

  const stlIdSet = new Set(stlUsers.map((s) => s.id));

  const campaignCountByStl = new Map<string, number>();
  for (const c of campaigns) {
    const stlId = c.assigned_stl_id;
    if (!stlId || !stlIdSet.has(stlId)) continue;
    campaignCountByStl.set(stlId, (campaignCountByStl.get(stlId) ?? 0) + 1);
  }

  const assignedTlIds = new Set<string>();

  const stl_nodes: STLNode[] = stlUsers.map((stl) => {
    const tls = teamLeaders
      .filter((tl) => tl.stl_id === stl.id)
      .map((tl) => ({
        id: tl.id,
        full_name: tl.full_name,
        email: tl.email,
        agent_code: tl.agent_code,
        status: tl.status,
      }))
      .sort((a, b) => getTeamLeaderMemberLabel(a).localeCompare(getTeamLeaderMemberLabel(b)));

    for (const tl of tls) {
      assignedTlIds.add(tl.id);
    }

    return {
      id: stl.id,
      full_name: stl.full_name,
      email: stl.email,
      team_leaders: tls,
      team_leader_count: tls.length,
      campaign_count: campaignCountByStl.get(stl.id) ?? 0,
    };
  });

  stl_nodes.sort((a, b) => getSTLLabel(a).localeCompare(getSTLLabel(b)));

  const unassigned_team_leaders: TeamLeaderMember[] = teamLeaders
    .filter((tl) => !assignedTlIds.has(tl.id))
    .map((tl) => ({
      id: tl.id,
      full_name: tl.full_name,
      email: tl.email,
      agent_code: tl.agent_code,
      status: tl.status,
    }))
    .sort((a, b) => getTeamLeaderMemberLabel(a).localeCompare(getTeamLeaderMemberLabel(b)));

  return {
    stls: stl_nodes,
    unassigned_team_leaders,
    stats: {
      stl_count: stl_nodes.length,
      total_team_leaders: teamLeaders.length,
      assigned_team_leaders: assignedTlIds.size,
      unassigned_team_leaders: unassigned_team_leaders.length,
    },
  };
}

/**
 * Attach each Team Leader's agents (from the generic TL → agents builder in
 * lib/tl/team-hierarchy.ts) onto an already-built STL hierarchy, so an STL's
 * own team view can show "Team Leader name → their agents" the same way
 * OM's /tl/team view shows "Team Leader name → their agents" today.
 */
export function attachAgentsToSTLHierarchy(
  data: STLHierarchyData,
  tlHierarchy: TeamHierarchyData
): STLHierarchyData {
  const tlNodeById = new Map(tlHierarchy.team_leaders.map((tl) => [tl.id, tl]));

  const attach = (tl: TeamLeaderMember): TeamLeaderMember => {
    const node = tlNodeById.get(tl.id);
    return {
      ...tl,
      agents: node?.agents ?? [],
      agent_count: node?.agent_count ?? 0,
    };
  };

  return {
    ...data,
    stls: data.stls.map((s) => ({ ...s, team_leaders: s.team_leaders.map(attach) })),
    unassigned_team_leaders: data.unassigned_team_leaders.map(attach),
  };
}
