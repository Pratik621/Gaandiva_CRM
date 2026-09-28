import type { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import { aggregateRevenueReportSummary } from "@/lib/campaign-revenue-metrics";
import { postgrestIlikePattern, postgrestOrIlikeFilters } from "@/lib/postgrest-filter";
import { fetchCampaignIdsForTeamLeader } from "@/lib/campaign/team-leader-assignments";
import {
  applyRevenueReportChannelFilter,
  fetchRevenueReportFilterOptions,
  fetchRevenueReportRows,
  groupRevenueReportByClient,
  sortRevenueReportRows,
  type RevenueReportCampaignRow,
  type RevenueReportClientGroup,
} from "@/lib/revenue-report/query";

export type CampaignTrackerFilters = {
  q?: string;
  client_code?: string;
  team_leader_id?: string;
  channel?: string;
  campaign_name?: string;
  lead_type?: string;
  status?: string;
  region?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
};

export type CampaignTrackerSummary = {
  total_campaigns: number;
  active_campaigns: number;
  paused_campaigns: number;
  completed_campaigns: number;
  total_allocation: number;
  total_post_qa: number;
  total_achieved: number;
  total_pending_allocation: number;
  total_leads_rejected: number;
};

export type CampaignTrackerFilterOptions = {
  statuses: string[];
  lead_types: string[];
  channels: string[];
  client_codes: string[];
  regions: string[];
  team_leaders: Array<{ id: string; name: string }>;
};

export function parseCampaignTrackerFilters(
  searchParams: URLSearchParams
): CampaignTrackerFilters {
  const sortDir = searchParams.get("sort_dir")?.toLowerCase();
  const dateFrom =
    searchParams.get("date_from")?.trim() ||
    dayjs().subtract(3, "month").format("YYYY-MM-DD");
  const dateTo =
    searchParams.get("date_to")?.trim() || dayjs().format("YYYY-MM-DD");

  return {
    q: searchParams.get("q")?.trim() || undefined,
    client_code: searchParams.get("client_code")?.trim() || undefined,
    team_leader_id: searchParams.get("team_leader_id")?.trim() || undefined,
    channel: searchParams.get("channel")?.trim() || undefined,
    campaign_name: searchParams.get("campaign_name")?.trim() || undefined,
    lead_type: searchParams.get("lead_type")?.trim() || undefined,
    status: searchParams.get("status")?.trim() || undefined,
    region: searchParams.get("region")?.trim() || undefined,
    date_from: dateFrom,
    date_to: dateTo,
    sort_by: searchParams.get("sort_by")?.trim() || undefined,
    sort_dir: sortDir === "asc" || sortDir === "desc" ? sortDir : "desc",
  };
}

async function resolveClientIdsByCode(
  supabase: SupabaseClient,
  orgId: string,
  clientCode: string
): Promise<string[]> {
  const pattern = postgrestIlikePattern(clientCode);
  if (!pattern) return [];

  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("client_code", pattern);

  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export async function resolveCampaignTrackerCampaignIds(
  supabase: SupabaseClient,
  orgId: string,
  filters: CampaignTrackerFilters
): Promise<string[]> {
  let scopedIds: string[] | null = null;

  if (filters.team_leader_id) {
    const junctionIds = await fetchCampaignIdsForTeamLeader(
      supabase,
      filters.team_leader_id,
      orgId
    );
    const tlSet = new Set(junctionIds);
    const { data: legacy } = await supabase
      .from("campaigns")
      .select("id")
      .eq("organization_id", orgId)
      .eq("assigned_team_leader_id", filters.team_leader_id);
    for (const row of (legacy ?? []) as { id: string }[]) tlSet.add(row.id);
    scopedIds = [...tlSet];
  }

  if (filters.client_code) {
    const clientIds = await resolveClientIdsByCode(supabase, orgId, filters.client_code);
    if (clientIds.length === 0) return [];
    if (scopedIds) {
      const { data } = await supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", orgId)
        .in("id", scopedIds)
        .in("client_id", clientIds);
      scopedIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    } else {
      const { data } = await supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", orgId)
        .in("client_id", clientIds);
      scopedIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    }
  }

  if (scopedIds && scopedIds.length === 0) return [];

  let query = supabase.from("campaigns").select("id").eq("organization_id", orgId);

  if (scopedIds) {
    query = query.in("id", scopedIds);
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.lead_type) {
    const pattern = postgrestIlikePattern(filters.lead_type);
    if (pattern) query = query.ilike("lead_type", pattern);
  }
  if (filters.campaign_name) {
    const pattern = postgrestIlikePattern(filters.campaign_name);
    if (pattern) query = query.ilike("name", pattern);
  }
  if (filters.region) {
    const pattern = postgrestIlikePattern(filters.region);
    if (pattern) query = query.ilike("geography", pattern);
  }

  if (filters.date_from) {
    query = query.or(
      `end_date.gte.${filters.date_from},end_date.is.null`
    );
  }
  if (filters.date_to) {
    query = query.or(
      `start_date.lte.${filters.date_to},start_date.is.null`
    );
  }

  const search = filters.q ?? "";
  if (search.length > 0) {
    const orFilter = postgrestOrIlikeFilters(
      ["name", "campaign_code", "client_name", "lead_type", "industry", "geography"],
      search
    );
    if (orFilter) query = query.or(orFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export function buildCampaignTrackerSummary(
  rows: RevenueReportCampaignRow[]
): CampaignTrackerSummary {
  let active = 0;
  let paused = 0;
  let completed = 0;

  for (const row of rows) {
    if (row.status === "active") active += 1;
    else if (row.status === "paused") paused += 1;
    else if (row.status === "completed") completed += 1;
  }

  const metrics = aggregateRevenueReportSummary(rows.map((r) => r.metrics));
  const totalPendingAllocation = rows.reduce(
    (sum, r) => sum + (r.metrics.pending_allocation ?? 0),
    0
  );

  return {
    total_campaigns: rows.length,
    active_campaigns: active,
    paused_campaigns: paused,
    completed_campaigns: completed,
    total_allocation: metrics.total_allocation,
    total_post_qa: metrics.total_post_qa,
    total_achieved: metrics.total_achieved,
    total_pending_allocation: totalPendingAllocation,
    total_leads_rejected: metrics.total_leads_rejected,
  };
}

export async function fetchCampaignTrackerFilterOptions(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[]
): Promise<CampaignTrackerFilterOptions> {
  const base = await fetchRevenueReportFilterOptions(supabase, orgId, campaignIds);

  const regions = new Set<string>();
  const clientCodes = new Set<string>();

  if (campaignIds.length > 0) {
    const { data: campaigns, error } = await supabase
      .from("campaigns")
      .select("geography, client_id")
      .eq("organization_id", orgId)
      .in("id", campaignIds);

    if (error) throw new Error(error.message);

    const clientIds = [
      ...new Set(
        ((campaigns ?? []) as { client_id: string | null }[])
          .map((c) => c.client_id)
          .filter(Boolean) as string[]
      ),
    ];

    for (const row of (campaigns ?? []) as { geography: string | null }[]) {
      if (row.geography?.trim()) regions.add(row.geography.trim());
    }

    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients")
        .select("client_code")
        .in("id", clientIds);
      for (const row of (clients ?? []) as { client_code: string | null }[]) {
        if (row.client_code?.trim()) clientCodes.add(row.client_code.trim());
      }
    }
  }

  return {
    statuses: base.statuses,
    lead_types: base.lead_types,
    channels: base.channels,
    client_codes: [...clientCodes].sort(),
    regions: [...regions].sort(),
    team_leaders: base.team_leaders,
  };
}

export type CampaignTrackerResult = {
  clients: RevenueReportClientGroup[];
  campaigns: RevenueReportCampaignRow[];
  summary: CampaignTrackerSummary;
  filterOptions: CampaignTrackerFilterOptions;
  date_range: { date_from: string; date_to: string };
  total_client_groups: number;
};

export async function loadCampaignTrackerData(
  supabase: SupabaseClient,
  orgId: string,
  filters: CampaignTrackerFilters,
  pagination?: { offset: number; limit: number }
): Promise<CampaignTrackerResult> {
  const campaignIds = await resolveCampaignTrackerCampaignIds(supabase, orgId, filters);

  const { rows: fetchedRows } = await fetchRevenueReportRows(
    supabase,
    orgId,
    campaignIds,
    {
      date_from: filters.date_from!,
      date_to: filters.date_to!,
      activityOnly: false,
    }
  );

  const allRows = applyRevenueReportChannelFilter(
    sortRevenueReportRows(fetchedRows, filters.sort_by, filters.sort_dir ?? "desc"),
    filters.channel
  );

  const clientGroups = groupRevenueReportByClient(allRows);
  const summary = buildCampaignTrackerSummary(allRows);
  const filterOptions = await fetchCampaignTrackerFilterOptions(
    supabase,
    orgId,
    campaignIds
  );

  const pageClients = pagination
    ? clientGroups.slice(pagination.offset, pagination.offset + pagination.limit)
    : clientGroups;

  return {
    clients: pageClients,
    campaigns: pageClients.flatMap((g) => g.campaigns),
    summary,
    filterOptions,
    date_range: {
      date_from: filters.date_from!,
      date_to: filters.date_to!,
    },
    total_client_groups: clientGroups.length,
  };
}

export function campaignTrackerRowToExportRecord(
  row: RevenueReportCampaignRow
): Record<string, unknown> {
  return {
    "Client Code": row.client_code ?? "",
    "Team Leader": row.assigned_team_leader_name ?? "",
    Channel: row.channel ?? "",
    "Campaign Name": row.name,
    "Lead Type": row.lead_type ?? "",
    "Start Date": row.start_date ?? "",
    "End Date": row.end_date ?? "",
    Status: row.status,
    "Total Allocation": row.metrics.total_allocation,
    "Post QA": row.metrics.post_qa,
    Achieved: row.metrics.achieved ?? "",
    "Pending Allocation": row.metrics.pending_allocation ?? "",
    "Leads Rejected": row.metrics.leads_rejected,
    Region: row.geography ?? "",
    CPC: row.metrics.cpc ?? "",
    "Weekly Call": row.weekly_call ?? "",
    "Weekly Report": row.weekly_report ?? "",
    "Additional Comments": row.additional_comments ?? "",
  };
}

export type { RevenueReportCampaignRow, RevenueReportClientGroup };
