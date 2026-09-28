import type { SupabaseClient } from "@supabase/supabase-js";

type CampaignAllocationFields = {
  total_allocation?: number | null;
  achieved?: number | null;
  pending_allocation?: number | null;
};

export type CampaignLeadMetrics = {
  total?: number | null;
  qualified?: number | null;
  delivered?: number | null;
};

export type CampaignAchievedFallback = "none" | "total" | "qualified" | "delivered";

export type EnrichCampaignAllocationOptions = {
  /** When live delivered metrics are unavailable, derive from lead metrics (default: delivered). */
  achievedFallback?: CampaignAchievedFallback;
  /** Cap computed achieved to `total_allocation` when allocation is set (default: true). */
  capToAllocation?: boolean;
};

/** Achieved = MIS-delivered leads (`leads.delivery_status = 'delivered'`). */
export const MIS_DELIVERED_ACHIEVED_OPTIONS: EnrichCampaignAllocationOptions = {
  achievedFallback: "delivered",
  capToAllocation: false,
};

function hasNumericValue(value: number | null | undefined): value is number {
  return value != null && !Number.isNaN(Number(value));
}

function capAchievedToAllocation(
  achieved: number,
  totalAllocation: number | null | undefined,
  cap: boolean
): number {
  if (!cap) return achieved;
  const total = Number(totalAllocation ?? 0) || 0;
  if (total <= 0) return achieved;
  return Math.min(achieved, total);
}

function fallbackAchievedFromMetrics(
  metrics: CampaignLeadMetrics | null | undefined,
  fallback: CampaignAchievedFallback
): number | null {
  if (fallback === "none") return null;
  if (fallback === "total") return Math.max(0, metrics?.total ?? 0);
  if (fallback === "qualified") return Math.max(0, metrics?.qualified ?? 0);
  return Math.max(0, metrics?.delivered ?? 0);
}

/**
 * Achieved = count of MIS-delivered leads (`delivery_status = 'delivered'`).
 * Prefers live `metrics.delivered` when aggregators provide it; otherwise stored DB value or fallback.
 */
export function resolveCampaignAchieved(
  campaign: CampaignAllocationFields,
  metrics?: CampaignLeadMetrics | null,
  options?: EnrichCampaignAllocationOptions
): number | null {
  const cap = options?.capToAllocation !== false;
  const fallback = options?.achievedFallback ?? "delivered";

  if (metrics != null && metrics.delivered != null && !Number.isNaN(Number(metrics.delivered))) {
    return capAchievedToAllocation(Math.max(0, Number(metrics.delivered)), campaign.total_allocation, cap);
  }

  if (hasNumericValue(campaign.achieved)) {
    return capAchievedToAllocation(Number(campaign.achieved), campaign.total_allocation, cap);
  }

  const derived = fallbackAchievedFromMetrics(metrics, fallback);
  if (derived == null) return null;

  return capAchievedToAllocation(derived, campaign.total_allocation, cap);
}

export function resolveCampaignPendingAllocation(
  campaign: CampaignAllocationFields,
  metrics?: CampaignLeadMetrics | null,
  options?: EnrichCampaignAllocationOptions
): number | null {
  const totalAllocation = Number(campaign.total_allocation ?? 0) || 0;
  const achieved = resolveCampaignAchieved(campaign, metrics, options);
  if (achieved == null) return null;
  if (totalAllocation <= 0) return null;

  return Math.max(0, totalAllocation - achieved);
}

export function enrichCampaignAllocationFields<T extends object>(
  campaign: T,
  metrics?: CampaignLeadMetrics | null,
  options?: EnrichCampaignAllocationOptions
): T & { achieved: number | null; pending_allocation: number | null } {
  const fields = campaign as CampaignAllocationFields;
  const achieved = resolveCampaignAchieved(fields, metrics, options);
  const pending_allocation = resolveCampaignPendingAllocation(fields, metrics, options);
  return { ...campaign, achieved, pending_allocation };
}

export async function countCampaignLeads(
  supabase: SupabaseClient,
  campaignId: string,
  options?: { orgId?: string; deliveredOnly?: boolean }
): Promise<number> {
  let query = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (options?.orgId) {
    query = query.eq("organization_id", options.orgId);
  }
  if (options?.deliveredOnly) {
    query = query.in("delivery_status", ["delivered", "Delivered"]);
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}
