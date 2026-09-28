import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPaginationMeta } from "@/lib/api-pagination";
import { enrichCampaignAllocationFields, MIS_DELIVERED_ACHIEVED_OPTIONS } from "@/lib/campaign-allocation";
import { enrichLeadsWithCreatorNames } from "@/lib/lead-display-names";
import { applyScoredLeadTaggingFilter } from "@/lib/lead-tagging";
import { countPendingAuditLeads } from "@/lib/qa-lead-audit";
import { isBillableLeadStatus } from "@/lib/leads/billable-status";
import { fetchAllByIdChunks } from "@/lib/supabase/in-chunks";

const LEADS_PAGE_SIZE = 1000;

const mistlExportLeadsSelect =
  "id, lead_id, name, company_name, phone, email, city, status, qa_status, followup_date, notes, assigned_agent_id, created_by, creator_display_name, created_at, updated_at, campaign_id, lead_type, job_title, job_function, job_level, direct_number, industry, company_number, employee_size, address, state, country, zip_code, founded_years, founded_years_link, revenue_range, revenue_link, contact_linkedin_url, company_linkedin_url, scored, scored_timezone, appointment, appointment_timezone, lead_tagging, lead_disposition, delivery_status, client_feedback_status, delivered_at, delivered_by, salutation, first_name, last_name, domain, phone_number_link, department, job_title_link, tenurity, vv_status, email_status, ev_tool, see_all_employees, employee_size_link, company_website_link, sic_code, sic_code_link, naics_code, naics_code_link, ra_comment, special_comments, call_back, call_notes, primary_reason, secondary_reason, qa_comments, cq1, cq2, cq3, cq4, cq5, extra_cq, audit_date, qa_name, qa_audited_by_id, qa_audited_at, asset_title, asset_title2, address2, address_link, actual_employee_size, industry_type_link, delivery_remark, rectification_status, rectification_qa_name, rectification_date, disqualification_reasons, disqualification_reason, rectified_reason";

export type MistlCampaignRow = {
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
  revenue_size?: string[] | null;
  abm?: boolean | null;
  seniority?: string | null;
  job_function?: string | null;
  creatives_url?: string[] | null;
  scored_leads_count: number;
  billable_leads_count: number;
  qa_pending_leads_count: number;
  delivered_leads_count: number;
  client_rejected_leads_count: number;
  last_lead_activity_at: string | null;
  leads?: Record<string, unknown>[];
};

export type MistlCampaignsSummary = {
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

async function fetchMistlLeadsForCounts(
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
          .select("campaign_id, created_at, delivery_status, client_feedback_status, qa_status, billable_status")
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

async function fetchMistlLeadsForExport(
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
          .select(mistlExportLeadsSelect)
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

export async function loadMistlCampaignsForDateRange(
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
  campaigns: MistlCampaignRow[];
  summary: MistlCampaignsSummary;
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
          employee_size, revenue_size, abm, seniority, job_function, creatives_url
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
    MistlCampaignRow,
    | "scored_leads_count"
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

  const tlIds = [
    ...new Set(campaignsList.map((c) => c.assigned_team_leader_id).filter(Boolean)),
  ] as string[];
  const tlNames: Record<string, string> = {};
  if (tlIds.length > 0) {
    const { data: tlUsers } = await supabase.from("users").select("id, full_name, email").in("id", tlIds);
    ((tlUsers ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach((u) => {
      tlNames[u.id] = u.full_name || u.email || "Unknown";
    });
  }

  const campaignIds = campaignsList.map((c) => c.id);
  const uploadRange = { startUtc, endUtc };
  const rawLeads = includeLeads
    ? await fetchMistlLeadsForExport(supabase, orgId, campaignIds, uploadRange)
    : await fetchMistlLeadsForCounts(supabase, orgId, campaignIds, uploadRange);

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

  const visible: MistlCampaignRow[] = [];

  for (const c of campaignsList) {
    const leads = leadsByCampaign[c.id] ?? [];
    const qaPending = countPendingAuditLeads(leads as { qa_status?: string | null }[]);
    let activityMs = 0;
    let delivered = 0;
    let billable = 0;
    let clientRejected = 0;
    for (const l of leads) {
      const createdMs = new Date(String(l.created_at)).getTime();
      if (Number.isFinite(createdMs) && createdMs > activityMs) activityMs = createdMs;
      if (isDeliveredStatus(l.delivery_status)) delivered += 1;
      if (isBillableLeadStatus(l.billable_status)) billable += 1;
      if (String(l.delivery_status ?? "").trim().toLowerCase() === "client_rejected") {
        clientRejected += 1;
      }
    }

    const metrics = { total: leads.length, qualified: 0, delivered };
    const enriched = enrichCampaignAllocationFields(c, metrics, MIS_DELIVERED_ACHIEVED_OPTIONS);

    visible.push({
      ...enriched,
      assigned_team_leader_name: c.assigned_team_leader_id
        ? tlNames[c.assigned_team_leader_id] ?? null
        : null,
      scored_leads_count: leads.length,
      billable_leads_count: billable,
      qa_pending_leads_count: qaPending,
      delivered_leads_count: delivered,
      client_rejected_leads_count: clientRejected,
      last_lead_activity_at: activityMs > 0 ? new Date(activityMs).toISOString() : null,
      leads: includeLeads ? leads : undefined,
    });
  }

  // Latest-launched campaigns first (start_date), then newest created.
  visible.sort((a, b) => {
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

  const summary: MistlCampaignsSummary = {
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
