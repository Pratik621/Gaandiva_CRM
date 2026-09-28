import type { SupabaseClient } from "@supabase/supabase-js";
import { applyScoredLeadTaggingFilter } from "@/lib/lead-tagging";

const LEADS_PAGE_SIZE = 1000;

const CLIENT_EXPORT_EXTRA =
  ", asset_title2, address2, address_link, actual_employee_size, industry_type_link, delivery_remark, rectification_status, rectification_qa_name, rectification_date";

const LEADS_SELECT =
  "id, lead_id, name, company_name, phone, email, city, status, qa_status, delivery_status, billable_status, delivered_at, delivered_by, disqualification_reasons, disqualification_reason, rectified_reason, followup_date, notes, assigned_agent_id, created_by, creator_display_name, created_at, updated_at, campaign_id, job_title, job_function, job_level, direct_number, industry, channel, company_number, employee_size, address, state, country, zip_code, founded_years, founded_years_link, revenue_range, revenue_link, contact_linkedin_url, company_linkedin_url, scored, scored_timezone, appointment, appointment_timezone, lead_tagging, lead_disposition, salutation, first_name, last_name, domain, phone_number_link, department, job_title_link, tenurity, vv_status, email_status, ev_tool, see_all_employees, employee_size_link, company_website_link, sic_code, sic_code_link, naics_code, naics_code_link, ra_comment, special_comments, call_back, call_notes, primary_reason, secondary_reason, qa_comments, cq1, cq2, cq3, cq4, cq5, extra_cq, audit_date, qa_name, qa_audited_by_id, qa_audited_at, asset_title" +
  CLIENT_EXPORT_EXTRA;
const LEADS_SELECT_NO_DELIVERY =
  "id, lead_id, name, company_name, phone, email, city, status, qa_status, billable_status, disqualification_reasons, disqualification_reason, rectified_reason, followup_date, notes, assigned_agent_id, created_by, creator_display_name, created_at, updated_at, campaign_id, job_title, job_function, job_level, direct_number, industry, channel, company_number, employee_size, address, state, country, zip_code, founded_years, founded_years_link, revenue_range, revenue_link, contact_linkedin_url, company_linkedin_url, scored, scored_timezone, appointment, appointment_timezone, lead_tagging, lead_disposition, salutation, first_name, last_name, domain, phone_number_link, department, job_title_link, tenurity, vv_status, email_status, ev_tool, see_all_employees, employee_size_link, company_website_link, sic_code, sic_code_link, naics_code, naics_code_link, ra_comment, special_comments, call_back, call_notes, primary_reason, secondary_reason, qa_comments, cq1, cq2, cq3, cq4, cq5, extra_cq, audit_date, qa_name, qa_audited_by_id, qa_audited_at, asset_title" +
  CLIENT_EXPORT_EXTRA;
const LEADS_SELECT_NO_DELIVERY_NO_CHANNEL =
  "id, lead_id, name, company_name, phone, email, city, status, qa_status, disqualification_reasons, disqualification_reason, rectified_reason, followup_date, notes, assigned_agent_id, created_by, creator_display_name, created_at, updated_at, campaign_id, job_title, job_function, job_level, direct_number, industry, company_number, employee_size, address, state, country, zip_code, founded_years, founded_years_link, revenue_range, revenue_link, contact_linkedin_url, company_linkedin_url, scored, scored_timezone, appointment, appointment_timezone, lead_tagging, lead_disposition, salutation, first_name, last_name, domain, phone_number_link, department, job_title_link, tenurity, vv_status, email_status, ev_tool, see_all_employees, employee_size_link, company_website_link, sic_code, sic_code_link, naics_code, naics_code_link, ra_comment, special_comments, call_back, call_notes, primary_reason, secondary_reason, qa_comments, cq1, cq2, cq3, cq4, cq5, extra_cq, audit_date, qa_name, qa_audited_by_id, qa_audited_at, asset_title" +
  CLIENT_EXPORT_EXTRA;

export type MisCampaignLeadRow = {
  assigned_agent_id: string | null;
  created_by: string | null;
  disqualification_reasons: string | null;
  disqualification_reason: string | null;
  rectified_reason: string | null;
  [key: string]: unknown;
};

function normalizeMisCampaignLeadRows(raw: Record<string, unknown>[]): MisCampaignLeadRow[] {
  return raw.map((row) => ({
    ...(row as MisCampaignLeadRow),
    disqualification_reasons: (row.disqualification_reasons as string | null) ?? null,
    disqualification_reason: (row.disqualification_reason as string | null) ?? null,
    rectified_reason: (row.rectified_reason as string | null) ?? null,
  }));
}

type LeadsQueryResult = {
  rows: MisCampaignLeadRow[];
  total: number;
  error: { message: string } | null;
};

async function queryMisCampaignScoredLeadsPage(
  admin: SupabaseClient,
  campaignId: string,
  offset: number,
  limit: number
): Promise<LeadsQueryResult> {
  let leadsData: Record<string, unknown>[] | null = null;
  let leadsError: { message: string } | null = null;
  let leadsCount: number | null = null;

  const primary = await applyScoredLeadTaggingFilter(
    admin
      .from("leads")
      .select(LEADS_SELECT + ", disqualification_reasons, disqualification_reason, rectified_reason", {
        count: "exact",
      })
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
  ).range(offset, offset + limit - 1);
  leadsData = (primary.data ?? null) as Record<string, unknown>[] | null;
  leadsError = primary.error;
  leadsCount = primary.count;

  if (leadsError && (leadsError.message?.includes("column") || leadsError.message?.includes("disqualification"))) {
    const fallback = await applyScoredLeadTaggingFilter(
      admin
        .from("leads")
        .select(
          "id, lead_id, name, company_name, phone, email, city, status, qa_status, delivery_status, delivered_at, delivered_by, followup_date, notes, assigned_agent_id, created_by, creator_display_name, created_at, updated_at, campaign_id, job_title, job_function, job_level, direct_number, industry, company_number, employee_size, address, state, country, zip_code, founded_years, founded_years_link, revenue_range, revenue_link, contact_linkedin_url, company_linkedin_url, scored, scored_timezone, appointment, appointment_timezone, lead_tagging, lead_disposition, disqualification_reasons, disqualification_reason, rectified_reason, rectification_status, rectification_qa_name, rectification_date, qa_name, qa_audited_by_id, qa_audited_at",
          { count: "exact" }
        )
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
    ).range(offset, offset + limit - 1);
    leadsData = (fallback.data ?? null) as Record<string, unknown>[] | null;
    leadsError = fallback.error;
    leadsCount = fallback.count;
  }

  if (leadsError && leadsError.message?.toLowerCase().includes("delivery_status")) {
    const fallbackNoDelivery = await applyScoredLeadTaggingFilter(
      admin
        .from("leads")
        .select(LEADS_SELECT_NO_DELIVERY, { count: "exact" })
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
    ).range(offset, offset + limit - 1);
    const fallbackRows = (fallbackNoDelivery.data ?? []) as unknown as Record<string, unknown>[];
    leadsData = fallbackRows.map((r) => ({
      ...r,
      delivery_status: "not_delivered",
    }));
    leadsError = fallbackNoDelivery.error;
    leadsCount = fallbackNoDelivery.count;
  }

  if (leadsError && leadsError.message?.toLowerCase().includes("channel")) {
    const fallbackNoChannel = await applyScoredLeadTaggingFilter(
      admin
        .from("leads")
        .select(LEADS_SELECT_NO_DELIVERY_NO_CHANNEL, { count: "exact" })
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
    ).range(offset, offset + limit - 1);
    const fallbackRows = (fallbackNoChannel.data ?? []) as unknown as Record<string, unknown>[];
    leadsData = fallbackRows.map((r) => ({
      ...r,
      delivery_status: "not_delivered",
      channel: null,
    }));
    leadsError = fallbackNoChannel.error;
    leadsCount = fallbackNoChannel.count;
  }

  if (leadsError) {
    return { rows: [], total: 0, error: leadsError };
  }

  return {
    rows: normalizeMisCampaignLeadRows((leadsData ?? []) as Record<string, unknown>[]),
    total: leadsCount ?? 0,
    error: null,
  };
}

export async function fetchMisCampaignScoredLeadsPage(
  admin: SupabaseClient,
  campaignId: string,
  offset: number,
  limit: number
): Promise<{ rows: MisCampaignLeadRow[]; total: number }> {
  const result = await queryMisCampaignScoredLeadsPage(admin, campaignId, offset, limit);
  if (result.error) throw new Error(result.error.message);
  return { rows: result.rows, total: result.total };
}

/** Paginated fetch — Supabase returns at most 1000 rows per request. */
export async function fetchAllMisCampaignScoredLeads(
  admin: SupabaseClient,
  campaignId: string
): Promise<{ rows: MisCampaignLeadRow[]; total: number }> {
  const all: MisCampaignLeadRow[] = [];
  let offset = 0;
  let total = 0;

  for (;;) {
    const chunk = await queryMisCampaignScoredLeadsPage(
      admin,
      campaignId,
      offset,
      LEADS_PAGE_SIZE
    );
    if (chunk.error) throw new Error(chunk.error.message);
    total = chunk.total;
    all.push(...chunk.rows);
    if (chunk.rows.length < LEADS_PAGE_SIZE || all.length >= total) break;
    offset += LEADS_PAGE_SIZE;
  }

  return { rows: all, total };
}
