import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";

export type CampaignSTLAssignment = {
  stl_id: string;
  stl_name: string | null;
};

type StlAssignmentRow = {
  stl_id: string;
  is_active: boolean;
};

/** Active STL ids for a campaign (junction + legacy column). */
export async function fetchActiveCampaignSTLIds(
  supabase: SupabaseClient,
  campaignId: string,
  legacyAssignedId?: string | null
): Promise<string[]> {
  const { data, error } = await supabase
    .from("campaign_stl_assignments")
    .select("stl_id, is_active")
    .eq("campaign_id", campaignId)
    .eq("is_active", true);

  const ids = new Set<string>();
  if (error) {
    console.error("fetchActiveCampaignSTLIds:", error.message);
  } else {
    for (const row of (data ?? []) as StlAssignmentRow[]) {
      if (row.stl_id) ids.add(row.stl_id);
    }
  }
  if (legacyAssignedId) ids.add(legacyAssignedId);
  return [...ids];
}

/** Merge junction rows, API payload, and legacy campaign column. */
export function normalizeSTLAssignments(
  assignments: CampaignSTLAssignment[] | null | undefined,
  legacy?: { assigned_stl_id?: string | null; assigned_stl_name?: string | null }
): CampaignSTLAssignment[] {
  const byId = new Map<string, CampaignSTLAssignment>();
  for (const row of assignments ?? []) {
    if (row.stl_id) {
      byId.set(row.stl_id, row);
    }
  }
  if (legacy?.assigned_stl_id) {
    const id = legacy.assigned_stl_id;
    if (!byId.has(id)) {
      byId.set(id, {
        stl_id: id,
        stl_name: legacy.assigned_stl_name ?? null,
      });
    }
  }
  return [...byId.values()];
}

export async function isUserAssignedToCampaignAsSTL(
  supabase: SupabaseClient,
  campaignId: string,
  userId: string,
  legacyAssignedId?: string | null
): Promise<boolean> {
  if (legacyAssignedId === userId) return true;

  const { data, error } = await supabase
    .from("campaign_stl_assignments")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("stl_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

export async function fetchCampaignSTLAssignments(
  supabase: SupabaseClient,
  campaignId: string,
  legacyAssignedId?: string | null
): Promise<CampaignSTLAssignment[]> {
  const ids = await fetchActiveCampaignSTLIds(supabase, campaignId, legacyAssignedId);
  if (ids.length === 0) return [];

  const names = await resolveUserDisplayNames(supabase, ids);
  return ids.map((stl_id) => ({
    stl_id,
    stl_name: names[stl_id] ?? null,
  }));
}

/** Batch-fetch STL assignments for many campaigns (2 queries vs N+1). */
export async function fetchBulkCampaignSTLAssignments(
  supabase: SupabaseClient,
  campaigns: Array<{ id: string; assigned_stl_id?: string | null }>
): Promise<Record<string, CampaignSTLAssignment[]>> {
  if (campaigns.length === 0) return {};

  const campaignIds = campaigns.map((c) => c.id);
  const idsByCampaign = new Map<string, Set<string>>();
  for (const c of campaigns) {
    const ids = new Set<string>();
    if (c.assigned_stl_id) ids.add(c.assigned_stl_id);
    idsByCampaign.set(c.id, ids);
  }

  const { data, error } = await supabase
    .from("campaign_stl_assignments")
    .select("campaign_id, stl_id")
    .in("campaign_id", campaignIds)
    .eq("is_active", true);

  if (error) {
    console.error("fetchBulkCampaignSTLAssignments:", error.message);
  } else {
    for (const row of (data ?? []) as { campaign_id: string; stl_id: string }[]) {
      if (!row.stl_id) continue;
      const bucket = idsByCampaign.get(row.campaign_id);
      if (bucket) bucket.add(row.stl_id);
    }
  }

  const allUserIds = [...new Set([...idsByCampaign.values()].flatMap((ids) => [...ids]))];
  const names = await resolveUserDisplayNames(supabase, allUserIds);

  const result: Record<string, CampaignSTLAssignment[]> = {};
  for (const c of campaigns) {
    const ids = [...(idsByCampaign.get(c.id) ?? [])];
    result[c.id] = ids.map((stl_id) => ({
      stl_id,
      stl_name: names[stl_id] ?? null,
    }));
  }
  return result;
}

export function formatSTLAssignmentLabel(assignments: CampaignSTLAssignment[]): string | null {
  if (assignments.length === 0) return null;
  const labels = assignments.map((a) => a.stl_name?.trim()).filter((n): n is string => Boolean(n));
  if (labels.length > 0) return labels.join(", ");
  return `${assignments.length} STL${assignments.length === 1 ? "" : "s"}`;
}

/** Campaign ids an STL can access via junction assignments. */
export async function fetchCampaignIdsForSTL(
  supabase: SupabaseClient,
  stlId: string,
  orgId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("campaign_stl_assignments")
    .select("campaign_id")
    .eq("stl_id", stlId)
    .eq("organization_id", orgId)
    .eq("is_active", true);

  if (error) {
    console.error("fetchCampaignIdsForSTL:", error.message);
    return [];
  }
  return [...new Set(((data ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id))];
}

/** Sync junction rows and legacy assigned_stl_id (primary = first id). */
export async function syncCampaignSTLAssignments(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    campaignId: string;
    stlIds: string[];
    assignedBy: string;
  }
): Promise<{ primarySTLId: string | null; error?: string }> {
  const { organizationId, campaignId, stlIds, assignedBy } = params;
  const newIds = [...new Set(stlIds.filter(Boolean))];
  const primarySTLId = newIds[0] ?? null;

  const { data: existing, error: existingError } = await supabase
    .from("campaign_stl_assignments")
    .select("stl_id")
    .eq("campaign_id", campaignId);

  if (existingError) {
    return { primarySTLId, error: existingError.message };
  }

  const existingIds = new Set(((existing ?? []) as { stl_id: string }[]).map((r) => r.stl_id));
  const newIdSet = new Set(newIds);

  const toInsert: {
    organization_id: string;
    campaign_id: string;
    stl_id: string;
    assigned_by: string;
  }[] = [];

  for (const stlId of newIds) {
    if (!existingIds.has(stlId)) {
      toInsert.push({
        organization_id: organizationId,
        campaign_id: campaignId,
        stl_id: stlId,
        assigned_by: assignedBy,
      });
    } else {
      await supabase
        .from("campaign_stl_assignments")
        .update({ is_active: true, assigned_by: assignedBy } as never)
        .eq("campaign_id", campaignId)
        .eq("stl_id", stlId);
    }
  }

  const toDeactivate = [...existingIds].filter((id) => !newIdSet.has(id));
  if (toDeactivate.length > 0) {
    await supabase
      .from("campaign_stl_assignments")
      .update({ is_active: false } as never)
      .eq("campaign_id", campaignId)
      .in("stl_id", toDeactivate);
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("campaign_stl_assignments")
      .insert(toInsert as never);
    if (insertError) {
      return { primarySTLId, error: insertError.message };
    }
  }

  const { error: campaignUpdateError } = await supabase
    .from("campaigns")
    .update({ assigned_stl_id: primarySTLId } as never)
    .eq("id", campaignId)
    .eq("organization_id", organizationId);

  if (campaignUpdateError) {
    return { primarySTLId, error: campaignUpdateError.message };
  }

  return { primarySTLId };
}
