import type { AdminClient } from "@/lib/supabase/admin";
import { normalizeRoleName } from "@/lib/auth/config";
import type {
  AnnouncementTargeting,
  AudiencePreview,
  PermissionRule,
} from "@/lib/announcements/types";

const LEADS_PAGE_SIZE = 1000;

/** Active user ids holding the given role in the org (roles → user_roles → users). */
async function fetchRoleUserIds(
  admin: AdminClient,
  orgId: string,
  targetRole: string
): Promise<Set<string>> {
  const wanted = normalizeRoleName(targetRole);

  const { data: orgRoles } = await admin
    .from("roles")
    .select("id, name")
    .eq("organization_id", orgId);

  const roleIds = ((orgRoles ?? []) as { id: string; name: string }[])
    .filter((r) => normalizeRoleName(r.name) === wanted)
    .map((r) => r.id);
  if (roleIds.length === 0) return new Set();

  const { data: urRows } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role_id", roleIds);

  const userIds = [...new Set(((urRows ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  if (userIds.length === 0) return new Set();

  const { data: users } = await admin
    .from("users")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("id", userIds);

  return new Set(((users ?? []) as { id: string }[]).map((u) => u.id));
}

/** Agent ids actively assigned to a campaign. */
async function fetchCampaignAgentIds(
  admin: AdminClient,
  campaignId: string
): Promise<Set<string>> {
  const { data } = await admin
    .from("campaign_assignments")
    .select("agent_id")
    .eq("campaign_id", campaignId)
    .eq("is_active", true);
  return new Set(
    ((data ?? []) as { agent_id: string }[]).map((r) => r.agent_id).filter(Boolean)
  );
}

/** Active TL ids on a campaign (junction table + legacy column). */
async function fetchCampaignTeamLeaderIdSet(
  admin: AdminClient,
  orgId: string,
  campaignId: string
): Promise<Set<string>> {
  const [{ data: junction }, { data: campaign }] = await Promise.all([
    admin
      .from("campaign_team_leader_assignments")
      .select("team_leader_id")
      .eq("campaign_id", campaignId)
      .eq("is_active", true),
    admin
      .from("campaigns")
      .select("assigned_team_leader_id")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);

  const ids = new Set<string>();
  for (const row of (junction ?? []) as { team_leader_id: string }[]) {
    if (row.team_leader_id) ids.add(row.team_leader_id);
  }
  const legacy = (campaign as { assigned_team_leader_id: string | null } | null)
    ?.assigned_team_leader_id;
  if (legacy) ids.add(legacy);
  return ids;
}

/**
 * The sender-TL's own team, matching buildTeamHierarchy semantics
 * (src/lib/tl/team-hierarchy.ts): direct reports first; agents on the TL's
 * campaigns count only when they have no reporting manager at all.
 */
async function fetchOwnTeamAgentIds(
  admin: AdminClient,
  orgId: string,
  teamLeaderId: string
): Promise<Set<string>> {
  const team = new Set<string>();

  const { data: directReports } = await admin
    .from("users")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .eq("reporting_manager_id", teamLeaderId);
  for (const u of (directReports ?? []) as { id: string }[]) team.add(u.id);

  const [{ data: junction }, { data: legacyCampaigns }] = await Promise.all([
    admin
      .from("campaign_team_leader_assignments")
      .select("campaign_id")
      .eq("team_leader_id", teamLeaderId)
      .eq("organization_id", orgId)
      .eq("is_active", true),
    admin
      .from("campaigns")
      .select("id")
      .eq("organization_id", orgId)
      .eq("assigned_team_leader_id", teamLeaderId),
  ]);

  const campaignIds = [
    ...new Set([
      ...((junction ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id),
      ...((legacyCampaigns ?? []) as { id: string }[]).map((r) => r.id),
    ]),
  ];
  if (campaignIds.length === 0) return team;

  const { data: assignments } = await admin
    .from("campaign_assignments")
    .select("agent_id")
    .in("campaign_id", campaignIds)
    .eq("is_active", true);

  const campaignAgentIds = [
    ...new Set(
      ((assignments ?? []) as { agent_id: string }[]).map((r) => r.agent_id).filter(Boolean)
    ),
  ].filter((id) => !team.has(id));
  if (campaignAgentIds.length === 0) return team;

  // Campaign membership counts only for agents without any reporting manager.
  const { data: freeAgents } = await admin
    .from("users")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("reporting_manager_id", null)
    .in("id", campaignAgentIds);
  for (const u of (freeAgents ?? []) as { id: string }[]) team.add(u.id);

  return team;
}

/** Distinct agents whose leads the QA sender audited (paged — 1000-row cap). */
async function fetchAuditedAgentIds(
  admin: AdminClient,
  orgId: string,
  qaUserId: string
): Promise<Set<string>> {
  const agentIds = new Set<string>();
  for (let offset = 0; ; offset += LEADS_PAGE_SIZE) {
    const { data, error } = await admin
      .from("leads")
      .select("assigned_agent_id")
      .eq("organization_id", orgId)
      .eq("qa_audited_by_id", qaUserId)
      .not("assigned_agent_id", "is", null)
      .range(offset, offset + LEADS_PAGE_SIZE - 1);
    if (error) {
      console.error("[announcements] audited agents fetch failed:", error.message);
      break;
    }
    const chunk = (data ?? []) as { assigned_agent_id: string | null }[];
    for (const row of chunk) {
      if (row.assigned_agent_id) agentIds.add(row.assigned_agent_id);
    }
    if (chunk.length < LEADS_PAGE_SIZE) break;
  }
  return agentIds;
}

/**
 * Resolve targeting into distinct, active, in-org user ids (sender excluded),
 * with the rule's scope restriction always applied.
 */
export async function resolveAudience(
  admin: AdminClient,
  orgId: string,
  sender: { id: string },
  rule: PermissionRule,
  targeting: AnnouncementTargeting
): Promise<string[]> {
  const roleUserIds = await fetchRoleUserIds(admin, orgId, targeting.target_role);

  let audience: Set<string>;
  if (targeting.mode === "role") {
    audience = roleUserIds;
  } else if (targeting.mode === "group") {
    if (!targeting.campaign_id) return [];
    const groupIds =
      normalizeRoleName(targeting.target_role) === "team_leader"
        ? await fetchCampaignTeamLeaderIdSet(admin, orgId, targeting.campaign_id)
        : await fetchCampaignAgentIds(admin, targeting.campaign_id);
    audience = new Set([...groupIds].filter((id) => roleUserIds.has(id)));
  } else {
    const requested = [...new Set(targeting.user_ids ?? [])];
    audience = new Set(requested.filter((id) => roleUserIds.has(id)));
  }

  if (rule.scope === "team") {
    const team = await fetchOwnTeamAgentIds(admin, orgId, sender.id);
    audience = new Set([...audience].filter((id) => team.has(id)));
  } else if (rule.scope === "audited_agents") {
    const audited = await fetchAuditedAgentIds(admin, orgId, sender.id);
    audience = new Set([...audience].filter((id) => audited.has(id)));
  }

  audience.delete(sender.id);
  return [...audience];
}

export async function previewAudience(
  admin: AdminClient,
  orgId: string,
  sender: { id: string },
  rule: PermissionRule,
  targeting: AnnouncementTargeting
): Promise<AudiencePreview> {
  const ids = await resolveAudience(admin, orgId, sender, rule, targeting);
  if (ids.length === 0) return { count: 0, sample: [] };

  const { data } = await admin
    .from("users")
    .select("id, full_name, email")
    .in("id", ids.slice(0, 5));

  const sample = ((data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
    (u) => ({ id: u.id, name: u.full_name?.trim() || u.email || "Unknown" })
  );
  return { count: ids.length, sample };
}
