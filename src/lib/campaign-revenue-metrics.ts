import {
  enrichCampaignAllocationFields,
  MIS_DELIVERED_ACHIEVED_OPTIONS,
  resolveCampaignAchieved,
  type CampaignLeadMetrics,
  type EnrichCampaignAllocationOptions,
} from "@/lib/campaign-allocation";

export type CampaignRevenueFields = {
  cpl?: number | null;
  revenue?: number | null;
  booked?: number | null;
  total_allocation?: number | null;
  post_qa?: number | null;
  achieved?: number | null;
  pending_allocation?: number | null;
};

export type CampaignRevenueSnapshot = {
  cpl: number | null;
  revenue: number | null;
  booked: number | null;
  pending_revenue: number | null;
  total_allocation: number;
  post_qa: number;
  achieved: number | null;
  pending_allocation: number | null;
  leads_rejected: number;
  cpc: number | null;
};

const REVENUE_ALLOCATION_OPTIONS: EnrichCampaignAllocationOptions = MIS_DELIVERED_ACHIEVED_OPTIONS;

function toNumber(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value);
}

/** Contract / booked value stored on campaign, or CPL × total allocation. */
export function resolveContractRevenue(
  campaign: CampaignRevenueFields
): number | null {
  const storedBooked = toNumber(campaign.booked);
  if (storedBooked != null) return storedBooked;

  const storedRevenue = toNumber(campaign.revenue);
  if (storedRevenue != null) return storedRevenue;

  const cpl = toNumber(campaign.cpl);
  const allocation = toNumber(campaign.total_allocation);
  if (cpl == null || allocation == null || cpl < 0 || allocation < 0) return null;
  return cpl * allocation;
}

/** @deprecated Use resolveContractRevenue or resolveAchievedRevenue explicitly. */
export function resolveCampaignRevenue(
  campaign: CampaignRevenueFields
): number | null {
  return resolveContractRevenue(campaign);
}

/** Stored booked contract value; does not default to earned revenue. */
export function resolveCampaignBooked(
  campaign: CampaignRevenueFields,
  contractRevenue?: number | null
): number | null {
  const stored = toNumber(campaign.booked);
  if (stored != null) return stored;
  return contractRevenue ?? resolveContractRevenue(campaign);
}

/** Earned revenue: CPL × achieved (0 when CPL missing or achieved ≤ 0). */
export function resolveAchievedRevenue(
  cpl: number | null,
  achieved: number | null
): number {
  const unitCpl = toNumber(cpl);
  if (unitCpl == null) return 0;

  const count =
    achieved != null && !Number.isNaN(Number(achieved)) ? Number(achieved) : 0;
  if (count <= 0) return 0;

  return unitCpl * count;
}

/** Earned revenue for a campaign row using the same achieved resolution as reports. */
export function computeCampaignEarnedRevenue(
  campaign: CampaignRevenueFields,
  metrics?: CampaignLeadMetrics | null,
  options?: EnrichCampaignAllocationOptions
): number {
  const achieved = resolveCampaignAchieved(campaign, metrics, {
    ...REVENUE_ALLOCATION_OPTIONS,
    ...options,
  });
  return resolveAchievedRevenue(toNumber(campaign.cpl), achieved);
}

/** CPL per lead from stored campaign CPL only. */
export function resolveUnitCpl(campaign: CampaignRevenueFields): number | null {
  return toNumber(campaign.cpl);
}

/**
 * Pending revenue = contract value not yet earned (CPL × pending allocation).
 */
export function resolvePendingRevenue(
  contractRevenue: number | null,
  cpl: number | null,
  achieved: number | null,
  pendingAllocation: number | null
): number | null {
  const unitCpl = toNumber(cpl);

  if (unitCpl != null && pendingAllocation != null && pendingAllocation >= 0) {
    return Math.max(0, unitCpl * pendingAllocation);
  }

  if (contractRevenue == null) return null;

  const earned = resolveAchievedRevenue(unitCpl, achieved);
  return Math.max(0, contractRevenue - earned);
}

/** Stored CPL (same as resolveUnitCpl). */
export function resolveEffectiveCpl(
  campaign: CampaignRevenueFields
): number | null {
  return resolveUnitCpl(campaign);
}

export function resolveCpc(
  totalSpend: number | null | undefined,
  deliveredLeads: number | null | undefined
): number | null {
  const spend = toNumber(totalSpend);
  const delivered = toNumber(deliveredLeads);
  if (spend == null || delivered == null || delivered <= 0) return null;
  return spend / delivered;
}

/** Derive channel label from campaign_metrics.channel_split or campaign_type. */
export function resolveCampaignChannel(
  channelSplit: Record<string, unknown> | null | undefined,
  campaignType: string | null | undefined
): string | null {
  if (channelSplit && typeof channelSplit === "object") {
    const email = Number(
      channelSplit.email ?? channelSplit.Email ?? channelSplit["e-mail"] ?? 0
    );
    const tele = Number(
      channelSplit.telemarketing ??
        channelSplit.tele ??
        channelSplit.phone ??
        channelSplit.calling ??
        0
    );
    if (email > 0 || tele > 0) {
      if (email >= tele) return "Email";
      return "Telemarketing";
    }
  }

  const type = (campaignType ?? "").trim();
  if (!type) return null;
  if (type.toLowerCase().includes("email")) return "Email";
  if (type.toLowerCase().includes("webinar") || type.toLowerCase().includes("live")) {
    return "Webinar";
  }
  return type;
}

export function buildCampaignRevenueSnapshot(
  campaign: CampaignRevenueFields,
  metrics: CampaignLeadMetrics | null | undefined,
  extras?: {
    leadsRejected?: number;
    totalCampaignSpend?: number | null;
    deliveredLeads?: number | null;
  }
): CampaignRevenueSnapshot {
  const enriched = enrichCampaignAllocationFields(
    campaign,
    metrics,
    REVENUE_ALLOCATION_OPTIONS
  );

  const achieved = enriched.achieved;
  const cpl = resolveUnitCpl(campaign);
  const contractRevenue = resolveContractRevenue(campaign);
  const revenue = resolveAchievedRevenue(cpl, achieved);
  const booked = resolveCampaignBooked(campaign, contractRevenue);

  return {
    cpl,
    revenue,
    booked,
    pending_revenue: resolvePendingRevenue(
      contractRevenue,
      cpl,
      achieved,
      enriched.pending_allocation
    ),
    total_allocation: Number(campaign.total_allocation ?? 0) || 0,
    post_qa: Number(campaign.post_qa ?? 0) || 0,
    achieved,
    pending_allocation: enriched.pending_allocation,
    leads_rejected: extras?.leadsRejected ?? 0,
    cpc: resolveCpc(extras?.totalCampaignSpend, extras?.deliveredLeads),
  };
}

export type RevenueReportSummary = {
  total_revenue: number;
  total_booked: number;
  total_pending_revenue: number;
  total_allocation: number;
  total_achieved: number;
  total_post_qa: number;
  total_leads_rejected: number;
  avg_cpl: number | null;
};

export function aggregateRevenueReportSummary(
  rows: CampaignRevenueSnapshot[]
): RevenueReportSummary {
  let totalRevenue = 0;
  let totalBooked = 0;
  let totalPendingRevenue = 0;
  let totalAllocation = 0;
  let totalAchieved = 0;
  let totalPostQa = 0;
  let totalLeadsRejected = 0;

  for (const row of rows) {
    totalRevenue += row.revenue ?? 0;
    totalBooked += row.booked ?? 0;
    totalPendingRevenue += row.pending_revenue ?? 0;
    totalAllocation += row.total_allocation;
    totalAchieved += row.achieved ?? 0;
    totalPostQa += row.post_qa;
    totalLeadsRejected += row.leads_rejected;
  }

  return {
    total_revenue: totalRevenue,
    total_booked: totalBooked,
    total_pending_revenue: totalPendingRevenue,
    total_allocation: totalAllocation,
    total_achieved: totalAchieved,
    total_post_qa: totalPostQa,
    total_leads_rejected: totalLeadsRejected,
    avg_cpl: totalAchieved > 0 ? totalRevenue / totalAchieved : null,
  };
}

export type RevenueChartPoint = { name: string; revenue: number };
export type MonthlyRevenuePoint = { month: string; revenue: number };

export function buildRevenueByCampaignChart(
  rows: Array<{ name: string; revenue: number | null }>,
  limit = 10
): RevenueChartPoint[] {
  return rows
    .map((r) => ({ name: r.name, revenue: r.revenue ?? 0 }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function buildRevenueByTeamLeaderChart(
  rows: Array<{ team_leader_name: string | null; revenue: number | null }>
): RevenueChartPoint[] {
  const byLeader: Record<string, number> = {};
  for (const row of rows) {
    const revenue = row.revenue ?? 0;
    if (revenue <= 0) continue;

    const names = (row.team_leader_name ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const leaders = names.length > 0 ? names : ["Unassigned"];
    const share = revenue / leaders.length;

    for (const name of leaders) {
      byLeader[name] = (byLeader[name] ?? 0) + share;
    }
  }

  return Object.entries(byLeader)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function buildRevenueByChannelChart(
  rows: Array<{ channel: string | null; revenue: number | null }>
): RevenueChartPoint[] {
  const byChannel: Record<string, number> = {};
  for (const row of rows) {
    const key = row.channel?.trim() || "Unknown";
    byChannel[key] = (byChannel[key] ?? 0) + (row.revenue ?? 0);
  }
  return Object.entries(byChannel)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function buildRevenueByLeadTypeChart(
  rows: Array<{ lead_type: string | null; revenue: number | null }>
): RevenueChartPoint[] {
  const byType: Record<string, number> = {};
  for (const row of rows) {
    const key = row.lead_type?.trim() || "Unknown";
    byType[key] = (byType[key] ?? 0) + (row.revenue ?? 0);
  }
  return Object.entries(byType)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function buildMonthlyRevenueTrend(
  rows: Array<{ start_date: string | null; revenue: number | null }>
): MonthlyRevenuePoint[] {
  const byMonth: Record<string, number> = {};
  for (const row of rows) {
    const raw = row.start_date ?? "";
    const month = raw.length >= 7 ? raw.slice(0, 7) : "Unknown";
    byMonth[month] = (byMonth[month] ?? 0) + (row.revenue ?? 0);
  }
  return Object.entries(byMonth)
    .map(([month, revenue]) => ({ month, revenue }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Display earned revenue: CPL × achieved. */
export function formatEarnedRevenue(
  cpl: number | null | undefined,
  achieved: number | null | undefined
): string {
  return formatCurrency(resolveAchievedRevenue(toNumber(cpl), achieved ?? null));
}
