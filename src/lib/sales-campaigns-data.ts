import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPaginationMeta } from "@/lib/api-pagination";
import { enrichCampaignAllocationFields, MIS_DELIVERED_ACHIEVED_OPTIONS } from "@/lib/campaign-allocation";
import { enrichLeadsWithCreatorNames } from "@/lib/lead-display-names";
import { applyScoredLeadTaggingFilter } from "@/lib/lead-tagging";
import {
  countDisqualifiedLeads,
  countPendingAuditLeads,
  countQualifiedLeads,
} from "@/lib/qa-lead-audit";
import {
  fetchBulkCampaignTeamLeaderAssignments,
  formatTeamLeaderAssignmentLabel,
} from "@/lib/campaign/team-leader-assignments";
import { fetchAllByIdChunks } from "@/lib/supabase/in-chunks";

const LEADS_PAGE_SIZE = 1000;

const salesExportLeadsSelect =
  "id, lead_id, name, company_name, phone, email, city, status, qa_status, followup_date, notes, assigned_agent_id, created_by, creator_display_name, created_at, updated_at, campaign_id, lead_type, job_title, job_function, job_level, direct_number, industry, company_number, employee_size, address, state, country, zip_code, founded_years, founded_years_link, revenue_range, revenue_link, contact_linkedin_url, company_linkedin_url, scored, scored_timezone, appointment, appointment_timezone, lead_tagging, lead_disposition, delivery_status, client_feedback_status, delivered_at, delivered_by, salutation, first_name, last_name, domain, phone_number_link, department, job_title_link, tenurity, vv_status, email_status, ev_tool, see_all_employees, employee_size_link, company_website_link, sic_code, sic_code_link, naics_code, naics_code_link, ra_comment, special_comments, call_back, call_notes, primary_reason, secondary_reason, qa_comments, cq1, cq2, cq3, cq4, cq5, extra_cq, audit_date, qa_name, qa_audited_by_id, qa_audited_at, asset_title, asset_title2, address2, address_link, actual_employee_size, industry_type_link, delivery_remark, rectification_status, rectification_qa_name, rectification_date, disqualification_reasons, disqualification_reason, rectified_reason";

export type SalesCampaignRow = {
  id: string;
  campaign_id?: string | null;
  campaign_code?: string | null;
  name: string;
  client_name?: string | null;
  description: string | null;
  industry: string | null;
  geography: string | null;
  target_designation?: string | null;
  lead_type?: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at?: string;
  cpl?: number | null;
  revenue?: number | null;
  booked?: number | null;
  total_allocation?: number | null;
  post_qa?: number | null;
  achieved?: number | null;
  pending_allocation?: number | null;
  weekly_call?: string | null;
  weekly_report?: string | null;
  additional_comments?: string | null;
  assigned_team_leader_id?: string | null;
  assigned_team_leader_name?: string | null;
  employee_size?: string[] | null;
  abm?: boolean | null;
  seniority?: string | null;
  job_function?: string | null;
  creatives_url?: string[] | null;
  lead_aggregated?: string | null;
  scored_leads_count: number;
  qualified_leads_count: number;
  rectified_leads_count: number;
  disqualified_leads_count: number;
  qa_pending_leads_count: number;
  delivered_leads_count: number;
  client_rejected_leads_count: number;
  last_lead_activity_at: string | null;
  leads?: Record<string, unknown>[];
};

export type SalesCampaignsSummary = {
  campaign_count: number;
  total_scored_leads: number;
  total_qa_pending_leads: number;
  total_delivered_leads: number;
};

function escapeIlikePattern(value: string): string {
  return value.replace(/%/g, "").replace(/_/g, "");
}

function isDeliveredStatus(status: unknown): boolean {
  const ds = String(status ?? "").trim().toLowerCase();
  return ds === "delivered" || ds === "delivered_by_mis";
}

export async function fetchDistinctLeadTypes(
  supabase: SupabaseClient,
  orgId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("lead_type")
    .eq("organization_id", orgId);

  if (error) throw new Error(error.message);

  const types = new Set<string>();
  for (const row of (data ?? []) as { lead_type: string | null }[]) {
    const raw = row.lead_type?.trim();
    if (!raw) continue;
    for (const part of raw.split(/[,;|]/)) {
      const t = part.trim();
      if (t) types.add(t);
    }
  }
  return [...types].sort((a, b) => a.localeCompare(b));
}

async function fetchSalesLeadsForCounts(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[],
  uploadRange: { startUtc: string; endUtc: string }
): Promise<Record<string, unknown>[]> {
  if (campaignIds.length === 0) return [];

  return fetchAllByIdChunks<Record<string, unknown>>(
    campaignIds,
    async (idChunk, from, to) =>
      applyScoredLeadTaggingFilter(
        supabase
          .from("leads")
          .select("campaign_id, created_at, delivery_status, client_feedback_status, qa_status, rectification_status")
          .eq("organization_id", orgId)
          .in("campaign_id", idChunk)
          .gte("created_at", uploadRange.startUtc)
          .lte("created_at", uploadRange.endUtc)
      )
        .order("created_at", { ascending: false })
        .range(from, to),
    LEADS_PAGE_SIZE
  );
}

async function fetchSalesLeadsForExport(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[],
  uploadRange: { startUtc: string; endUtc: string }
): Promise<Record<string, unknown>[]> {
  if (campaignIds.length === 0) return [];

  const all = await fetchAllByIdChunks<Record<string, unknown>>(
    campaignIds,
    async (idChunk, from, to) =>
      applyScoredLeadTaggingFilter(
        supabase
          .from("leads")
          .select(salesExportLeadsSelect)
          .eq("organization_id", orgId)
          .in("campaign_id", idChunk)
          .gte("created_at", uploadRange.startUtc)
          .lte("created_at", uploadRange.endUtc)
      )
        .order("created_at", { ascending: false })
        .range(from, to),
    LEADS_PAGE_SIZE
  );

  return enrichLeadsWithCreatorNames(supabase, all, orgId);
}

export async function loadSalesCampaignsForDateRange(
  supabase: SupabaseClient,
  orgId: string,
  startUtc: string,
  endUtc: string,
  options?: {
    page?: number;
    limit?: number;
    includeLeads?: boolean;
    campaignIds?: string[];
    q?: string;
    status?: string;
    leadType?: string;
  }
): Promise<{
  campaigns: SalesCampaignRow[];
  summary: SalesCampaignsSummary;
  lead_types: string[];
  pagination?: ReturnType<typeof buildPaginationMeta>;
}> {
  const page = Math.max(1, options?.page ?? 1);
  const campaignIdFilter = (options?.campaignIds ?? []).filter(Boolean);
  const maxLimit = campaignIdFilter.length > 0 ? 500 : 100;
  const limit = Math.max(1, Math.min(maxLimit, options?.limit ?? 10));
  const includeLeads = options?.includeLeads ?? false;
  const offset = (page - 1) * limit;
  const searchRaw = (options?.q ?? "").trim();
  const statusFilter = (options?.status ?? "").trim() || null;
  const leadTypeFilter = (options?.leadType ?? "").trim() || null;

  const [leadTypes, campaignsResult] = await Promise.all([
    fetchDistinctLeadTypes(supabase, orgId),
    (async () => {
      let campaignsQuery = supabase
        .from("campaigns")
        .select(`
          id, campaign_id, campaign_code, name, client_name, description, industry, geography, target_designation, lead_type, status,
          start_date, end_date, created_at, cpl, revenue, booked, total_allocation, post_qa, achieved, pending_allocation,
          weekly_call, weekly_report, additional_comments, assigned_team_leader_id,
          employee_size, abm, seniority, job_function, creatives_url, lead_aggregated
        `)
        .eq("organization_id", orgId)
        .order("start_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (campaignIdFilter.length > 0) {
        campaignsQuery = campaignsQuery.in("id", campaignIdFilter);
      }
      if (statusFilter) {
        campaignsQuery = campaignsQuery.eq("status", statusFilter);
      }
      if (leadTypeFilter) {
        const safe = escapeIlikePattern(leadTypeFilter);
        if (safe.length > 0) {
          campaignsQuery = campaignsQuery.ilike("lead_type", `%${safe}%`);
        }
      }
      if (searchRaw.length > 0) {
        const safe = escapeIlikePattern(searchRaw);
        if (safe.length > 0) {
          campaignsQuery = campaignsQuery.or(
            `name.ilike.%${safe}%,campaign_code.ilike.%${safe}%,client_name.ilike.%${safe}%,lead_type.ilike.%${safe}%,industry.ilike.%${safe}%,geography.ilike.%${safe}%`
          );
        }
      }

      return campaignsQuery;
    })(),
  ]);

  const { data: campaigns, error: campaignsError } = await campaignsResult;
  if (campaignsError) throw new Error(campaignsError.message);

  type CampaignBase =     Omit<
    SalesCampaignRow,
    | "scored_leads_count"
    | "qualified_leads_count"
    | "rectified_leads_count"
    | "disqualified_leads_count"
    | "qa_pending_leads_count"
    | "delivered_leads_count"
    | "client_rejected_leads_count"
    | "last_lead_activity_at"
    | "leads"
    | "assigned_team_leader_name"
  >;

  const campaignsList = (campaigns ?? []) as CampaignBase[];

  if (campaignsList.length === 0) {
    return {
      campaigns: [],
      summary: { campaign_count: 0, total_scored_leads: 0, total_qa_pending_leads: 0, total_delivered_leads: 0 },
      lead_types: leadTypes,
      pagination: buildPaginationMeta(page, limit, 0),
    };
  }

  const tlByCampaign = await fetchBulkCampaignTeamLeaderAssignments(
    supabase,
    campaignsList.map((c) => ({
      id: c.id,
      assigned_team_leader_id: c.assigned_team_leader_id,
    }))
  );

  const campaignIds = campaignsList.map((c) => c.id);
  const uploadRange = { startUtc, endUtc };
  const rawLeads = includeLeads
    ? await fetchSalesLeadsForExport(supabase, orgId, campaignIds, uploadRange)
    : await fetchSalesLeadsForCounts(supabase, orgId, campaignIds, uploadRange);

  const leadsByCampaign: Record<string, Record<string, unknown>[]> = {};
  for (const c of campaignsList) {
    leadsByCampaign[c.id] = [];
  }
  for (const l of rawLeads) {
    const cid = l.campaign_id as string;
    if (leadsByCampaign[cid]) {
      leadsByCampaign[cid].push(l);
    }
  }

  const visible: SalesCampaignRow[] = [];

  for (const c of campaignsList) {
    const leads = leadsByCampaign[c.id] ?? [];
    // The Sales campaign table represents lead activity in the selected upload
    // date range, so campaigns without a lead in that range are not listed.
    if (leads.length === 0) continue;

    const qaPending = countPendingAuditLeads(leads as { qa_status?: string | null }[]);
    const qualified = countQualifiedLeads(leads as { qa_status?: string | null }[]);
    const rectified = leads.filter(
      (lead) =>
        String(lead.qa_status ?? "").trim().toLowerCase() === "rectified" &&
        String(lead.rectification_status ?? "").trim().toLowerCase() === "rectified"
    ).length;
    const disqualified = countDisqualifiedLeads(leads as { qa_status?: string | null }[]);
    let activityMs = 0;
    let delivered = 0;
    let clientRejected = 0;
    for (const l of leads) {
      const createdMs = new Date(String(l.created_at)).getTime();
      if (Number.isFinite(createdMs) && createdMs > activityMs) activityMs = createdMs;
      if (isDeliveredStatus(l.delivery_status)) delivered += 1;
      if (String(l.delivery_status ?? "").trim().toLowerCase() === "client_rejected") {
        clientRejected += 1;
      }
    }

    // Client-rejected leads have their own delivery status, so Achieved equals Delivered.
    const metrics = { total: leads.length, qualified: 0, delivered };
    const enriched = enrichCampaignAllocationFields(c, metrics, MIS_DELIVERED_ACHIEVED_OPTIONS);
    const assigned_team_leader_name = formatTeamLeaderAssignmentLabel(
      tlByCampaign[c.id] ?? []
    );

    const leadsWithTl = includeLeads
      ? leads.map((l) => ({ ...l, team_leader_name: assigned_team_leader_name }))
      : undefined;

    visible.push({
      ...enriched,
      assigned_team_leader_name,
      scored_leads_count: leads.length,
      qualified_leads_count: qualified,
      rectified_leads_count: rectified,
      disqualified_leads_count: disqualified,
      qa_pending_leads_count: qaPending,
      delivered_leads_count: delivered,
      client_rejected_leads_count: clientRejected,
      last_lead_activity_at: activityMs > 0 ? new Date(activityMs).toISOString() : null,
      leads: leadsWithTl,
    });
  }

  // Campaigns with the newest lead activity appear first. Campaigns without
  // activity in the selected range fall back to their launch/creation date.
  visible.sort((a, b) => {
    const aActivity = a.last_lead_activity_at
      ? new Date(a.last_lead_activity_at).getTime()
      : 0;
    const bActivity = b.last_lead_activity_at
      ? new Date(b.last_lead_activity_at).getTime()
      : 0;
    if (bActivity !== aActivity) return bActivity - aActivity;

    const aLaunch = a.start_date
      ? new Date(a.start_date).getTime()
      : a.created_at
        ? new Date(a.created_at).getTime()
        : 0;
    const bLaunch = b.start_date
      ? new Date(b.start_date).getTime()
      : b.created_at
        ? new Date(b.created_at).getTime()
        : 0;
    if (bLaunch !== aLaunch) return bLaunch - aLaunch;

    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bCreated - aCreated;
  });

  const summary: SalesCampaignsSummary = {
    campaign_count: visible.filter((c) => (c.scored_leads_count ?? 0) > 0).length,
    total_scored_leads: visible.reduce((sum, c) => sum + (c.scored_leads_count ?? 0), 0),
    total_qa_pending_leads: visible.reduce((sum, c) => sum + (c.qa_pending_leads_count ?? 0), 0),
    total_delivered_leads: visible.reduce((sum, c) => sum + (c.delivered_leads_count ?? 0), 0),
  };

  const paged = visible.slice(offset, offset + limit).map((c) =>
    includeLeads ? c : { ...c, leads: undefined }
  );

  return {
    campaigns: paged,
    summary,
    lead_types: leadTypes,
    pagination: buildPaginationMeta(page, limit, visible.length),
  };
}
