import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";

export type CampaignTeamLeaderAssignment = {
  team_leader_id: string;
  team_leader_name: string | null;
};

type TlAssignmentRow = {
  team_leader_id: string;
  is_active: boolean;
};

/** Active team leader ids for a campaign (junction + legacy column). */
export async function fetchActiveCampaignTeamLeaderIds(
  supabase: SupabaseClient,
  campaignId: string,
  legacyAssignedId?: string | null
): Promise<string[]> {
  const { data, error } = await supabase
    .from("campaign_team_leader_assignments")
    .select("team_leader_id, is_active")
    .eq("campaign_id", campaignId)
    .eq("is_active", true);

  const ids = new Set<string>();
  if (error) {
    console.error("fetchActiveCampaignTeamLeaderIds:", error.message);
  } else {
    for (const row of (data ?? []) as TlAssignmentRow[]) {
      if (row.team_leader_id) ids.add(row.team_leader_id);
    }
  }
  if (legacyAssignedId) ids.add(legacyAssignedId);
  return [...ids];
}

/** Merge junction rows, API payload, and legacy campaign column. */
export function normalizeTeamLeaderAssignments(
  assignments: CampaignTeamLeaderAssignment[] | null | undefined,
  legacy?: { assigned_team_leader_id?: string | null; assigned_team_leader_name?: string | null }
): CampaignTeamLeaderAssignment[] {
  const byId = new Map<string, CampaignTeamLeaderAssignment>();
  for (const row of assignments ?? []) {
    if (row.team_leader_id) {
      byId.set(row.team_leader_id, row);
    }
  }
  if (legacy?.assigned_team_leader_id) {
    const id = legacy.assigned_team_leader_id;
    if (!byId.has(id)) {
      byId.set(id, {
        team_leader_id: id,
        team_leader_name: legacy.assigned_team_leader_name ?? null,
      });
    }
  }
  return [...byId.values()];
}

export async function isUserAssignedToCampaignAsTeamLeader(
  supabase: SupabaseClient,
  campaignId: string,
  userId: string,
  legacyAssignedId?: string | null
): Promise<boolean> {
  if (legacyAssignedId === userId) return true;

  const { data, error } = await supabase
    .from("campaign_team_leader_assignments")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("team_leader_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

export async function fetchCampaignTeamLeaderAssignments(
  supabase: SupabaseClient,
  campaignId: string,
  legacyAssignedId?: string | null
): Promise<CampaignTeamLeaderAssignment[]> {
  const ids = await fetchActiveCampaignTeamLeaderIds(
    supabase,
    campaignId,
    legacyAssignedId
  );
  if (ids.length === 0) return [];

  const names = await resolveUserDisplayNames(supabase, ids);
  return ids.map((team_leader_id) => ({
    team_leader_id,
    team_leader_name: names[team_leader_id] ?? null,
  }));
}

/** Batch-fetch team leader assignments for many campaigns (2 queries vs N+1). */
export async function fetchBulkCampaignTeamLeaderAssignments(
  supabase: SupabaseClient,
  campaigns: Array<{ id: string; assigned_team_leader_id?: string | null }>
): Promise<Record<string, CampaignTeamLeaderAssignment[]>> {
  if (campaigns.length === 0) return {};

  const campaignIds = campaigns.map((c) => c.id);
  const idsByCampaign = new Map<string, Set<string>>();
  for (const c of campaigns) {
    const ids = new Set<string>();
    if (c.assigned_team_leader_id) ids.add(c.assigned_team_leader_id);
    idsByCampaign.set(c.id, ids);
  }

  const { data, error } = await supabase
    .from("campaign_team_leader_assignments")
    .select("campaign_id, team_leader_id")
    .in("campaign_id", campaignIds)
    .eq("is_active", true);

  if (error) {
    console.error("fetchBulkCampaignTeamLeaderAssignments:", error.message);
  } else {
    for (const row of (data ?? []) as { campaign_id: string; team_leader_id: string }[]) {
      if (!row.team_leader_id) continue;
      const bucket = idsByCampaign.get(row.campaign_id);
      if (bucket) bucket.add(row.team_leader_id);
    }
  }

  const allUserIds = [
    ...new Set([...idsByCampaign.values()].flatMap((ids) => [...ids])),
  ];
  const names = await resolveUserDisplayNames(supabase, allUserIds);

  const result: Record<string, CampaignTeamLeaderAssignment[]> = {};
  for (const c of campaigns) {
    const ids = [...(idsByCampaign.get(c.id) ?? [])];
    result[c.id] = ids.map((team_leader_id) => ({
      team_leader_id,
      team_leader_name: names[team_leader_id] ?? null,
    }));
  }
  return result;
}

export function formatTeamLeaderAssignmentLabel(
  assignments: CampaignTeamLeaderAssignment[]
): string | null {
  if (assignments.length === 0) return null;
  const labels = assignments
    .map((a) => a.team_leader_name?.trim())
    .filter((n): n is string => Boolean(n));
  if (labels.length > 0) return labels.join(", ");
  return `${assignments.length} team leader${assignments.length === 1 ? "" : "s"}`;
}

/** Campaign ids a TL can access via junction assignments. */
export async function fetchCampaignIdsForTeamLeader(
  supabase: SupabaseClient,
  teamLeaderId: string,
  orgId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("campaign_team_leader_assignments")
    .select("campaign_id")
    .eq("team_leader_id", teamLeaderId)
    .eq("organization_id", orgId)
    .eq("is_active", true);

  if (error) {
    console.error("fetchCampaignIdsForTeamLeader:", error.message);
    return [];
  }
  return [...new Set(((data ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id))];
}

/** Sync junction rows and legacy assigned_team_leader_id (primary = first id). */
export async function syncCampaignTeamLeaderAssignments(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    campaignId: string;
    teamLeaderIds: string[];
    assignedBy: string;
  }
): Promise<{ primaryTeamLeaderId: string | null; error?: string }> {
  const { organizationId, campaignId, teamLeaderIds, assignedBy } = params;
  const newIds = [...new Set(teamLeaderIds.filter(Boolean))];
  const primaryTeamLeaderId = newIds[0] ?? null;

  const { data: existing, error: existingError } = await supabase
    .from("campaign_team_leader_assignments")
    .select("team_leader_id")
    .eq("campaign_id", campaignId);

  if (existingError) {
    return { primaryTeamLeaderId, error: existingError.message };
  }

  const existingIds = new Set(
    ((existing ?? []) as { team_leader_id: string }[]).map((r) => r.team_leader_id)
  );
  const newIdSet = new Set(newIds);

  const toInsert: {
    organization_id: string;
    campaign_id: string;
    team_leader_id: string;
    assigned_by: string;
  }[] = [];

  for (const teamLeaderId of newIds) {
    if (!existingIds.has(teamLeaderId)) {
      toInsert.push({
        organization_id: organizationId,
        campaign_id: campaignId,
        team_leader_id: teamLeaderId,
        assigned_by: assignedBy,
      });
    } else {
      await supabase
        .from("campaign_team_leader_assignments")
        .update({ is_active: true, assigned_by: assignedBy } as never)
        .eq("campaign_id", campaignId)
        .eq("team_leader_id", teamLeaderId);
    }
  }

  const toDeactivate = [...existingIds].filter((id) => !newIdSet.has(id));
  if (toDeactivate.length > 0) {
    await supabase
      .from("campaign_team_leader_assignments")
      .update({ is_active: false } as never)
      .eq("campaign_id", campaignId)
      .in("team_leader_id", toDeactivate);
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("campaign_team_leader_assignments")
      .insert(toInsert as never);
    if (insertError) {
      return { primaryTeamLeaderId, error: insertError.message };
    }
  }

  const { error: campaignUpdateError } = await supabase
    .from("campaigns")
    .update({ assigned_team_leader_id: primaryTeamLeaderId } as never)
    .eq("id", campaignId)
    .eq("organization_id", organizationId);

  if (campaignUpdateError) {
    return { primaryTeamLeaderId, error: campaignUpdateError.message };
  }

  return { primaryTeamLeaderId };
}
