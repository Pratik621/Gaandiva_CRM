import type { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import { normalizeRoleName } from "@/lib/auth/config";
import {
  hasOrgWideCampaignAccess,
  hasTLAccess,
  isOperationsManagerRole,
} from "@/lib/auth/tl-access";
import { hasSTLAccess, isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import { fetchCampaignIdsForTeamLeader } from "@/lib/campaign/team-leader-assignments";
import { fetchCampaignIdsForSTL } from "@/lib/campaign/stl-assignments";
import {
  buildCampaignRevenueSnapshot,
  resolveCampaignChannel,
  resolveContractRevenue,
  aggregateRevenueReportSummary,
  type CampaignRevenueSnapshot,
} from "@/lib/campaign-revenue-metrics";
import { chunkArray, postgrestIlikePattern, postgrestOrIlikeFilters } from "@/lib/postgrest-filter";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";
import {
  type RevenueReportPeriod,
  resolveRevenueReportPeriod,
} from "@/lib/revenue-report/period";
import { chunkIds, fetchAllByIdChunks } from "@/lib/supabase/in-chunks";

export type RevenueReportFilters = {
  q?: string;
  status?: string;
  lead_type?: string;
  channel?: string;
  campaign_type?: string;
  campaign_name?: string;
  client_name?: string;
  team_leader_id?: string;
  agent_id?: string;
  period?: RevenueReportPeriod;
  period_from?: string;
  period_to?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
};

export type RevenueReportPeriodContext = {
  date_from: string;
  date_to: string;
  label: string;
};

export type RevenueReportCampaignRow = {
  id: string;
  campaign_id: string;
  campaign_code: string | null;
  name: string;
  client_id: string | null;
  client_name: string | null;
  client_code: string | null;
  campaign_owner: string | null;
  channel: string | null;
  aggregator: string | null;
  campaign_type: string | null;
  lead_type: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  geography: string | null;
  weekly_call: string | null;
  weekly_report: string | null;
  additional_comments: string | null;
  assigned_team_leader_name: string | null;
  agent_names: string[];
  metrics: CampaignRevenueSnapshot;
};

type CampaignDbRow = {
  id: string;
  campaign_id: string;
  campaign_code: string | null;
  name: string;
  client_id: string | null;
  client_name: string | null;
  lead_type: string | null;
  campaign_type: string | null;
  lead_aggregated: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  geography: string | null;
  cpl: number | null;
  revenue: number | null;
  booked: number | null;
  total_allocation: number | null;
  post_qa: number | null;
  achieved: number | null;
  pending_allocation: number | null;
  weekly_call: string | null;
  weekly_report: string | null;
  additional_comments: string | null;
  assigned_team_leader_id: string | null;
  created_by: string | null;
  created_at: string;
  campaign_metrics:
    | {
        sponsor_name: string | null;
        total_campaign_spend: number | null;
        total_leads_delivered: number | null;
        channel_split: Record<string, unknown> | null;
      }
    | {
        sponsor_name: string | null;
        total_campaign_spend: number | null;
        total_leads_delivered: number | null;
        channel_split: Record<string, unknown> | null;
      }[]
    | null;
};

export function canAccessRevenueReport(roleNames: string[]): boolean {
  if (roleNames.some((r) => isOperationsManagerRole(r))) return true;
  if (hasTLAccess(roleNames)) return true;
  if (hasSTLAccess(roleNames)) return true;
  if (hasOrgWideCampaignAccess(roleNames)) return true;
  return roleNames.some((r) => {
    const n = normalizeRoleName(r);
    return n === "agent" || n === "client_viewer";
  });
}

export function parseRevenueReportFilters(
  searchParams: URLSearchParams
): RevenueReportFilters & RevenueReportPeriodContext {
  const sortDir = searchParams.get("sort_dir")?.toLowerCase();
  const rawPeriod = searchParams.get("period")?.trim() as RevenueReportPeriod | undefined;
  const period: RevenueReportPeriod =
    rawPeriod === "3months" ||
    rawPeriod === "quarterly" ||
    rawPeriod === "yearly" ||
    rawPeriod === "custom"
      ? rawPeriod
      : "monthly";

  const periodFrom = searchParams.get("period_from")?.trim() || undefined;
  const periodTo = searchParams.get("period_to")?.trim() || undefined;
  const resolved = resolveRevenueReportPeriod(period, periodFrom, periodTo);

  return {
    q: searchParams.get("q")?.trim() || undefined,
    status: searchParams.get("status")?.trim() || undefined,
    lead_type: searchParams.get("lead_type")?.trim() || undefined,
    channel: searchParams.get("channel")?.trim() || undefined,
    campaign_type: searchParams.get("campaign_type")?.trim() || undefined,
    campaign_name: searchParams.get("campaign_name")?.trim() || undefined,
    client_name: searchParams.get("client_name")?.trim() || undefined,
    team_leader_id: searchParams.get("team_leader_id")?.trim() || undefined,
    agent_id: searchParams.get("agent_id")?.trim() || undefined,
    period,
    period_from: periodFrom,
    period_to: periodTo,
    date_from: resolved.date_from,
    date_to: resolved.date_to,
    label: resolved.label,
    sort_by: searchParams.get("sort_by")?.trim() || undefined,
    sort_dir: sortDir === "asc" || sortDir === "desc" ? sortDir : "desc",
  };
}

function firstMetric(metrics: CampaignDbRow["campaign_metrics"]) {
  if (!metrics) return null;
  return Array.isArray(metrics) ? metrics[0] : metrics;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  name: "name",
  client_name: "client_name",
  status: "status",
  start_date: "start_date",
  end_date: "end_date",
  cpl: "cpl",
  revenue: "revenue",
  booked: "booked",
  total_allocation: "total_allocation",
  post_qa: "post_qa",
  achieved: "achieved",
};

export async function resolveRevenueReportCampaignIds(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  roleNames: string[],
  clientId: string | null,
  filters: RevenueReportFilters
): Promise<string[]> {
  const seeAllOrg = hasOrgWideCampaignAccess(roleNames);
  const isAgent = roleNames.some((r) => normalizeRoleName(r) === "agent");
  const isClientViewer = roleNames.some((r) => normalizeRoleName(r) === "client_viewer");

  let scopedIds: string[] | null = null;

  if (isClientViewer) {
    if (!clientId) return [];
    const { data } = await supabase
      .from("campaigns")
      .select("id")
      .eq("organization_id", orgId)
      .eq("client_id", clientId);
    scopedIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
  } else if (isAgent) {
    const { data } = await supabase
      .from("campaign_assignments")
      .select("campaign_id")
      .eq("agent_id", userId)
      .eq("is_active", true);
    scopedIds = [
      ...new Set(((data ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id)),
    ];
  } else if (!seeAllOrg && roleNames.some((r) => isSeniorTeamLeaderRole(r))) {
    scopedIds = await fetchCampaignIdsForSTL(supabase, userId, orgId);
    const { data: legacy } = await supabase
      .from("campaigns")
      .select("id")
      .eq("organization_id", orgId)
      .eq("assigned_stl_id", userId);
    for (const row of (legacy ?? []) as { id: string }[]) {
      if (!scopedIds.includes(row.id)) scopedIds.push(row.id);
    }
  } else if (!seeAllOrg) {
    scopedIds = await fetchCampaignIdsForTeamLeader(supabase, userId, orgId);
    const { data: legacy } = await supabase
      .from("campaigns")
      .select("id")
      .eq("organization_id", orgId)
      .eq("assigned_team_leader_id", userId);
    for (const row of (legacy ?? []) as { id: string }[]) {
      if (!scopedIds.includes(row.id)) scopedIds.push(row.id);
    }
  }

  if (filters.agent_id) {
    const { data } = await supabase
      .from("campaign_assignments")
      .select("campaign_id")
      .eq("agent_id", filters.agent_id)
      .eq("is_active", true);
    const agentCampaignIds = new Set(
      ((data ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id)
    );
    if (scopedIds) {
      scopedIds = scopedIds.filter((id) => agentCampaignIds.has(id));
    } else {
      scopedIds = [...agentCampaignIds];
    }
  }

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
    if (scopedIds) {
      scopedIds = scopedIds.filter((id) => tlSet.has(id));
    } else {
      scopedIds = [...tlSet];
    }
  }

  if (scopedIds && scopedIds.length === 0) return [];

  // When scoped to a large ID list, filter in chunks to avoid URL/header overflow.
  if (scopedIds && scopedIds.length > 0) {
    const matched = new Set<string>();
    for (const idChunk of chunkIds(scopedIds)) {
      let query = supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", orgId)
        .in("id", idChunk);

      if (filters.status) query = query.eq("status", filters.status);
      if (filters.lead_type) {
        const pattern = postgrestIlikePattern(filters.lead_type);
        if (pattern) query = query.ilike("lead_type", pattern);
      }
      if (filters.campaign_type) query = query.eq("campaign_type", filters.campaign_type);
      if (filters.campaign_name) {
        const pattern = postgrestIlikePattern(filters.campaign_name);
        if (pattern) query = query.ilike("name", pattern);
      }
      if (filters.client_name) {
        const pattern = postgrestIlikePattern(filters.client_name);
        if (pattern) query = query.ilike("client_name", pattern);
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
      for (const row of (data ?? []) as { id: string }[]) matched.add(row.id);
    }
    return [...matched];
  }

  let query = supabase
    .from("campaigns")
    .select("id")
    .eq("organization_id", orgId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.lead_type) {
    const pattern = postgrestIlikePattern(filters.lead_type);
    if (pattern) query = query.ilike("lead_type", pattern);
  }
  if (filters.campaign_type) query = query.eq("campaign_type", filters.campaign_type);
  if (filters.campaign_name) {
    const pattern = postgrestIlikePattern(filters.campaign_name);
    if (pattern) query = query.ilike("name", pattern);
  }
  if (filters.client_name) {
    const pattern = postgrestIlikePattern(filters.client_name);
    if (pattern) query = query.ilike("client_name", pattern);
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

const POST_QA_STATUSES = new Set(["qualified", "registered", "attended", "no_show", "approved", "pass"]);

type PeriodLeadRow = {
  campaign_id: string;
  status: string | null;
  qa_status: string | null;
  delivery_status: string | null;
  delivered_at: string | null;
  qa_audited_at: string | null;
  updated_at: string | null;
  created_at: string;
};

export type PeriodLeadMetrics = {
  total: number;
  qualified: number;
  delivered: number;
  post_qa: number;
  dq: number;
};

export type PeriodLeadAggregation = {
  byCampaign: Record<string, PeriodLeadMetrics>;
  monthlyRevenue: Record<string, number>;
};

function emptyPeriodMetrics(): PeriodLeadMetrics {
  return { total: 0, qualified: 0, delivered: 0, post_qa: 0, dq: 0 };
}

function leadActivityTimestamp(lead: PeriodLeadRow): string {
  const isDelivered =
    String(lead.delivery_status ?? "").trim().toLowerCase() === "delivered";
  if (isDelivered && lead.delivered_at) return lead.delivered_at;
  if (lead.qa_audited_at) return lead.qa_audited_at;
  if (lead.updated_at) return lead.updated_at;
  return lead.created_at;
}

function isTimestampInPeriod(ts: string, dateFrom: string, dateTo: string): boolean {
  const at = dayjs(ts);
  if (!at.isValid()) return false;
  const start = dayjs(dateFrom).startOf("day");
  const end = dayjs(dateTo).endOf("day");
  return (
    (at.isAfter(start) || at.isSame(start)) && (at.isBefore(end) || at.isSame(end))
  );
}

/** Booked / allocation metrics: campaign start_date must fall in the selected period (end_date ignored). */
export function isCampaignStartDateInPeriod(
  startDate: string | null | undefined,
  dateFrom: string,
  dateTo: string
): boolean {
  if (!startDate?.trim()) return false;
  const start = dayjs(startDate.trim());
  if (!start.isValid()) return false;
  const from = dayjs(dateFrom).startOf("day");
  const to = dayjs(dateTo).endOf("day");
  return (
    (start.isAfter(from) || start.isSame(from, "day")) &&
    (start.isBefore(to) || start.isSame(to, "day"))
  );
}

export async function aggregateLeadMetricsByCampaignInPeriod(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[],
  dateFrom: string,
  dateTo: string,
  cplByCampaign: Record<string, number | null>
): Promise<PeriodLeadAggregation> {
  const byCampaign: Record<string, PeriodLeadMetrics> = {};
  const monthlyRevenue: Record<string, number> = {};
  for (const id of campaignIds) byCampaign[id] = emptyPeriodMetrics();
  if (campaignIds.length === 0) return { byCampaign, monthlyRevenue };

  const leads = await fetchAllByIdChunks<PeriodLeadRow>(
    campaignIds,
    async (idChunk, from, to) =>
      supabase
        .from("leads")
        .select(
          "campaign_id, status, qa_status, delivery_status, delivered_at, qa_audited_at, updated_at, created_at"
        )
        .eq("organization_id", orgId)
        .in("campaign_id", idChunk)
        .order("created_at", { ascending: true })
        .range(from, to)
  );

  for (const lead of leads) {
    const activityAt = leadActivityTimestamp(lead);
    if (!isTimestampInPeriod(activityAt, dateFrom, dateTo)) continue;

    const bucket = byCampaign[lead.campaign_id];
    if (!bucket) continue;

    bucket.total += 1;

    const st = String(lead.status ?? "").toLowerCase().trim();
    const qa = String(lead.qa_status ?? "").toLowerCase().trim();
    const qaOrStatus = qa || st;
    const isDelivered =
      String(lead.delivery_status ?? "").trim().toLowerCase() === "delivered";

    if (isDelivered) {
      bucket.delivered += 1;
      const cpl = cplByCampaign[lead.campaign_id];
      if (cpl != null && cpl > 0) {
        const month = activityAt.slice(0, 7);
        monthlyRevenue[month] = (monthlyRevenue[month] ?? 0) + cpl;
      }
    }

    if (POST_QA_STATUSES.has(qaOrStatus) || POST_QA_STATUSES.has(st)) {
      bucket.qualified += 1;
      bucket.post_qa += 1;
    }

    if (qaOrStatus === "disqualified" || st === "disqualified") {
      bucket.dq += 1;
    }
  }

  return { byCampaign, monthlyRevenue };
}

export type FetchRevenueReportRowsOptions = {
  date_from: string;
  date_to: string;
  /** When true, hide campaigns with no period lead activity unless they have contract/booked value. */
  activityOnly?: boolean;
};

function campaignHasContractValue(campaign: CampaignDbRow): boolean {
  const contract = resolveContractRevenue(campaign);
  return contract != null && contract > 0;
}

function applyContractMetricsPeriodFilter(
  snapshot: CampaignRevenueSnapshot,
  startDate: string | null | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined
): CampaignRevenueSnapshot {
  if (!dateFrom || !dateTo) return snapshot;
  if (isCampaignStartDateInPeriod(startDate, dateFrom, dateTo)) return snapshot;

  return {
    ...snapshot,
    booked: null,
    pending_revenue: null,
    total_allocation: 0,
    pending_allocation: null,
  };
}

export type FetchRevenueReportResult = {
  rows: RevenueReportCampaignRow[];
  monthlyRevenue: Record<string, number>;
};

export async function fetchRevenueReportRows(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[],
  options?: FetchRevenueReportRowsOptions
): Promise<FetchRevenueReportResult> {
  if (campaignIds.length === 0) {
    return { rows: [], monthlyRevenue: {} };
  }

  const campaignSelect = `
      id, campaign_id, campaign_code, name, client_id, client_name, lead_type, campaign_type,
      lead_aggregated, status, start_date, end_date, geography, cpl, revenue, booked,
      total_allocation, post_qa, achieved, pending_allocation, weekly_call, weekly_report,
      additional_comments, assigned_team_leader_id, created_by, created_at,
      campaign_metrics(
        sponsor_name, total_campaign_spend, total_leads_delivered, channel_split
      )
    `;

  const campaigns = await fetchAllByIdChunks<CampaignDbRow>(
    campaignIds,
    async (idChunk, from, to) =>
      supabase
        .from("campaigns")
        .select(campaignSelect)
        .eq("organization_id", orgId)
        .in("id", idChunk)
        .order("created_at", { ascending: true })
        .range(from, to)
  );
  const ids = campaigns.map((c) => c.id);

  const cplByCampaign: Record<string, number | null> = {};
  for (const c of campaigns) {
    cplByCampaign[c.id] = c.cpl;
  }

  const periodAggregation =
    options?.date_from && options?.date_to
      ? await aggregateLeadMetricsByCampaignInPeriod(
          supabase,
          orgId,
          ids,
          options.date_from,
          options.date_to,
          cplByCampaign
        )
      : null;

  const clientIds = [
    ...new Set(campaigns.map((c) => c.client_id).filter(Boolean) as string[]),
  ];
  const userIds = [
    ...new Set(
      campaigns
        .flatMap((c) => [c.created_by, c.assigned_team_leader_id])
        .filter(Boolean) as string[]
    ),
  ];

  const [clientsRes, userNames, assignmentRows, tlJunctionRows] = await Promise.all([
    clientIds.length > 0
      ? fetchAllByIdChunks<{ id: string; client_code: string | null }>(
          clientIds,
          async (idChunk, from, to) =>
            supabase
              .from("clients")
              .select("id, client_code")
              .in("id", idChunk)
              .order("id", { ascending: true })
              .range(from, to)
        ).then((data) => ({ data }))
      : Promise.resolve({ data: [] as { id: string; client_code: string | null }[] }),
    resolveUserDisplayNames(supabase, userIds),
    fetchAllByIdChunks<{ campaign_id: string; agent_id: string }>(
      ids,
      async (idChunk, from, to) =>
        supabase
          .from("campaign_assignments")
          .select("campaign_id, agent_id")
          .in("campaign_id", idChunk)
          .eq("is_active", true)
          .order("assigned_at", { ascending: true })
          .range(from, to)
    ),
    fetchAllByIdChunks<{ campaign_id: string; team_leader_id: string }>(
      ids,
      async (idChunk, from, to) =>
        supabase
          .from("campaign_team_leader_assignments")
          .select("campaign_id, team_leader_id")
          .in("campaign_id", idChunk)
          .eq("is_active", true)
          .order("assigned_at", { ascending: true })
          .range(from, to)
    ),
  ]);

  const clientCodeById: Record<string, string | null> = {};
  for (const c of clientsRes.data ?? []) {
    clientCodeById[c.id] = c.client_code;
  }

  const agentIds = [...new Set(assignmentRows.map((a) => a.agent_id))];
  const tlIds = [...new Set(tlJunctionRows.map((t) => t.team_leader_id))];
  const extraNames = await resolveUserDisplayNames(supabase, [...agentIds, ...tlIds]);

  const agentsByCampaign: Record<string, string[]> = {};
  for (const row of assignmentRows) {
    if (!agentsByCampaign[row.campaign_id]) agentsByCampaign[row.campaign_id] = [];
    const label = extraNames[row.agent_id] ?? row.agent_id;
    if (!agentsByCampaign[row.campaign_id].includes(label)) {
      agentsByCampaign[row.campaign_id].push(label);
    }
  }

  const tlByCampaign: Record<string, string[]> = {};
  for (const row of tlJunctionRows) {
    if (!tlByCampaign[row.campaign_id]) tlByCampaign[row.campaign_id] = [];
    const label = extraNames[row.team_leader_id] ?? row.team_leader_id;
    if (!tlByCampaign[row.campaign_id].includes(label)) {
      tlByCampaign[row.campaign_id].push(label);
    }
  }

  const rows: RevenueReportCampaignRow[] = [];

  for (const c of campaigns) {
    const periodMetrics = periodAggregation?.byCampaign[c.id];
    const hasPeriodActivity = (periodMetrics?.total ?? 0) > 0;
    const startInPeriod =
      options?.date_from && options?.date_to
        ? isCampaignStartDateInPeriod(c.start_date, options.date_from, options.date_to)
        : true;
    const hasBookedInPeriod = startInPeriod && campaignHasContractValue(c);

    if (options?.activityOnly && !hasPeriodActivity && !hasBookedInPeriod) {
      continue;
    }

    const metric = firstMetric(c.campaign_metrics);
    const counts = periodMetrics
      ? {
          total: periodMetrics.total,
          qualified: periodMetrics.qualified,
          delivered: periodMetrics.delivered,
        }
      : { total: 0, qualified: 0, delivered: 0 };

    const campaignForSnapshot =
      periodMetrics != null
        ? {
            ...c,
            achieved: periodMetrics.delivered,
            post_qa: periodMetrics.post_qa,
          }
        : c;

    const dq = periodMetrics?.dq ?? 0;
    const channel = resolveCampaignChannel(metric?.channel_split ?? null, c.campaign_type);
    const snapshot = applyContractMetricsPeriodFilter(
      buildCampaignRevenueSnapshot(campaignForSnapshot, counts, {
        leadsRejected: dq,
        totalCampaignSpend: metric?.total_campaign_spend,
        deliveredLeads: periodMetrics?.delivered ?? metric?.total_leads_delivered,
      }),
      c.start_date,
      options?.date_from,
      options?.date_to
    );

    const tlNames = tlByCampaign[c.id] ?? [];
    if (c.assigned_team_leader_id) {
      const legacy = userNames[c.assigned_team_leader_id] ?? extraNames[c.assigned_team_leader_id];
      if (legacy && !tlNames.includes(legacy)) tlNames.unshift(legacy);
    }

    const owner =
      metric?.sponsor_name?.trim() ||
      (c.created_by ? userNames[c.created_by] ?? null : null);

    rows.push({
      id: c.id,
      campaign_id: c.campaign_id,
      campaign_code: c.campaign_code,
      name: c.name,
      client_id: c.client_id,
      client_name: c.client_name,
      client_code: c.client_id ? clientCodeById[c.client_id] ?? null : null,
      campaign_owner: owner,
      channel,
      aggregator: c.lead_aggregated,
      campaign_type: c.campaign_type,
      lead_type: c.lead_type,
      start_date: c.start_date,
      end_date: c.end_date,
      status: c.status,
      geography: c.geography,
      weekly_call: c.weekly_call,
      weekly_report: c.weekly_report,
      additional_comments: c.additional_comments,
      assigned_team_leader_name: tlNames.length > 0 ? tlNames.join(", ") : null,
      agent_names: agentsByCampaign[c.id] ?? [],
      metrics: snapshot,
    });
  }

  return { rows, monthlyRevenue: periodAggregation?.monthlyRevenue ?? {} };
}

export function sortRevenueReportRows(
  rows: RevenueReportCampaignRow[],
  sortBy: string | undefined,
  sortDir: "asc" | "desc"
): RevenueReportCampaignRow[] {
  const key = sortBy && SORTABLE_COLUMNS[sortBy] ? sortBy : "start_date";
  const dir = sortDir === "asc" ? 1 : -1;

  const getValue = (row: RevenueReportCampaignRow): string | number => {
    if (key === "cpl") return row.metrics.cpl ?? 0;
    if (key === "revenue") return row.metrics.revenue ?? 0;
    if (key === "booked") return row.metrics.booked ?? 0;
    if (key === "achieved") return row.metrics.achieved ?? 0;
    if (key === "post_qa") return row.metrics.post_qa;
    if (key === "total_allocation") return row.metrics.total_allocation;
    const raw = (row as Record<string, unknown>)[key];
    if (typeof raw === "number") return raw;
    return String(raw ?? "");
  };

  return [...rows].sort((a, b) => {
    const av = getValue(a);
    const bv = getValue(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

export async function fetchRevenueReportFilterOptions(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[]
) {
  if (campaignIds.length === 0) {
    return {
      statuses: [],
      lead_types: [],
      channels: [],
      campaign_types: [],
      clients: [],
      team_leaders: [] as Array<{ id: string; name: string }>,
      agents: [] as Array<{ id: string; name: string }>,
    };
  }

  type FilterCampaignRow = {
    id: string;
    status: string | null;
    lead_type: string | null;
    campaign_type: string | null;
    client_name: string | null;
    campaign_metrics:
      | { channel_split: Record<string, unknown> | null }
      | { channel_split: Record<string, unknown> | null }[]
      | null;
  };

  const campaigns = await fetchAllByIdChunks<FilterCampaignRow>(
    campaignIds,
    async (idChunk, from, to) =>
      supabase
        .from("campaigns")
        .select("id, status, lead_type, campaign_type, client_name, campaign_metrics(channel_split)")
        .eq("organization_id", orgId)
        .in("id", idChunk)
        .order("id", { ascending: true })
        .range(from, to)
  );

  const statuses = new Set<string>();
  const leadTypes = new Set<string>();
  const channels = new Set<string>();
  const campaignTypes = new Set<string>();
  const clients = new Set<string>();

  for (const row of campaigns) {
    if (row.status) statuses.add(row.status);
    if (row.lead_type) leadTypes.add(row.lead_type);
    if (row.campaign_type) campaignTypes.add(row.campaign_type);
    if (row.client_name) clients.add(row.client_name);
    const metric = firstMetric(row.campaign_metrics as CampaignDbRow["campaign_metrics"]);
    const channel = resolveCampaignChannel(metric?.channel_split ?? null, row.campaign_type);
    if (channel) channels.add(channel);
  }

  const [assignmentAgentIds, tlRows] = await Promise.all([
    fetchAllByIdChunks<{ agent_id: string }>(
      campaignIds,
      async (idChunk, from, to) =>
        supabase
          .from("campaign_assignments")
          .select("agent_id")
          .in("campaign_id", idChunk)
          .eq("is_active", true)
          .order("assigned_at", { ascending: true })
          .range(from, to)
    ),
    fetchAllByIdChunks<{ team_leader_id: string }>(
      campaignIds,
      async (idChunk, from, to) =>
        supabase
          .from("campaign_team_leader_assignments")
          .select("team_leader_id")
          .in("campaign_id", idChunk)
          .eq("is_active", true)
          .order("assigned_at", { ascending: true })
          .range(from, to)
    ),
  ]);

  const agentIds = [...new Set(assignmentAgentIds.map((a) => a.agent_id))];
  const tlIds = [...new Set(tlRows.map((t) => t.team_leader_id))];

  const names = await resolveUserDisplayNames(supabase, [...agentIds, ...tlIds]);

  return {
    statuses: [...statuses].sort(),
    lead_types: [...leadTypes].sort(),
    channels: [...channels].sort(),
    campaign_types: [...campaignTypes].sort(),
    clients: [...clients].sort(),
    team_leaders: tlIds.map((id) => ({ id, name: names[id] ?? id })),
    agents: agentIds.map((id) => ({ id, name: names[id] ?? id })),
  };
}

export type RevenueReportClientGroup = {
  key: string;
  client_id: string | null;
  client_code: string | null;
  client_name: string | null;
  campaign_count: number;
  metrics: CampaignRevenueSnapshot;
  campaigns: RevenueReportCampaignRow[];
};

export function groupRevenueReportByClient(
  rows: RevenueReportCampaignRow[]
): RevenueReportClientGroup[] {
  const byClient = new Map<string, RevenueReportCampaignRow[]>();

  for (const row of rows) {
    const key = row.client_id ?? row.client_name?.trim() ?? "unknown";
    const bucket = byClient.get(key) ?? [];
    bucket.push(row);
    byClient.set(key, bucket);
  }

  return [...byClient.entries()]
    .map(([key, campaigns]) => {
      const sorted = [...campaigns].sort((a, b) =>
        (b.start_date ?? "").localeCompare(a.start_date ?? "")
      );
      const first = sorted[0];
      const summary = aggregateRevenueReportSummary(sorted.map((c) => c.metrics));

      return {
        key,
        client_id: first.client_id,
        client_code: first.client_code,
        client_name: first.client_name,
        campaign_count: sorted.length,
        metrics: {
          cpl: summary.avg_cpl,
          revenue: summary.total_revenue,
          booked: summary.total_booked,
          pending_revenue: summary.total_pending_revenue,
          total_allocation: summary.total_allocation,
          post_qa: summary.total_post_qa,
          achieved: summary.total_achieved,
          pending_allocation: sorted.reduce(
            (sum, c) => sum + (c.metrics.pending_allocation ?? 0),
            0
          ),
          leads_rejected: summary.total_leads_rejected,
          cpc: null,
        },
        campaigns: sorted,
      };
    })
    .sort((a, b) => (a.client_name ?? "").localeCompare(b.client_name ?? ""));
}

export function applyRevenueReportChannelFilter(
  rows: RevenueReportCampaignRow[],
  channel?: string
): RevenueReportCampaignRow[] {
  if (!channel) return rows;
  const needle = channel.toLowerCase();
  return rows.filter((r) => (r.channel ?? "").toLowerCase().includes(needle));
}

export function buildMonthlyRevenueTrendFromPeriod(
  monthlyRevenue: Record<string, number>
): Array<{ month: string; revenue: number }> {
  return Object.entries(monthlyRevenue)
    .map(([month, revenue]) => ({ month, revenue }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function revenueRowToExportRecord(row: RevenueReportCampaignRow): Record<string, unknown> {
  return {
    "Client Name": row.client_name ?? "",
    "Client Code": row.client_code ?? "",
    "Campaign Owner": row.campaign_owner ?? "",
    Channel: row.channel ?? "",
    Aggregator: row.aggregator ?? "",
    "Campaign Name": row.name,
    "Lead Type": row.lead_type ?? "",
    "Start Date": row.start_date ?? "",
    "End Date": row.end_date ?? "",
    Status: row.status,
    CPL: row.metrics.cpl ?? "",
    Revenue: row.metrics.revenue ?? "",
    Booked: row.metrics.booked ?? "",
    "Pending Revenue": row.metrics.pending_revenue ?? "",
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
    "Team Leader": row.assigned_team_leader_name ?? "",
    Agents: row.agent_names.join(", "),
  };
}
