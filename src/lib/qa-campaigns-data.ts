import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichLeadsWithCreatorNames } from "@/lib/lead-display-names";
import { applyScoredLeadTaggingFilter } from "@/lib/lead-tagging";
import {
  countAuditedLeads,
  countDisqualifiedLeads,
  countPendingAuditLeads,
  countQualifiedLeads,
} from "@/lib/qa-lead-audit";
import { buildPaginationMeta } from "@/lib/api-pagination";
import { chunkIds } from "@/lib/supabase/in-chunks";

const LEADS_PAGE_SIZE = 1000;

/** Minimal columns for dashboard KPIs / list counts / charts. */
export const LEADS_SELECT_AUDIT =
  "id, campaign_id, qa_status, rectification_status, created_at, updated_at, qa_audited_at, audit_date, delivery_status";

/** `delivered_by_mis` is a legacy value still present in older rows. */
function isDeliveredLead(deliveryStatus: unknown): boolean {
  const ds = String(deliveryStatus ?? "").trim().toLowerCase();
  return ds === "delivered" || ds === "delivered_by_mis";
}

function countDeliveredLeads(leads: Record<string, unknown>[]): number {
  return leads.filter((l) => isDeliveredLead(l.delivery_status)).length;
}

function countRectifiedLeads(leads: Record<string, unknown>[]): number {
  return leads.filter(
    (lead) =>
      String(lead.qa_status ?? "").trim().toLowerCase() === "rectified" &&
      String(lead.rectification_status ?? "").trim().toLowerCase() === "rectified"
  ).length;
}

const leadsSelectBase =
  "id, lead_id, name, company_name, phone, email, city, status, qa_status, followup_date, notes, assigned_agent_id, created_by, creator_display_name, created_at, updated_at, campaign_id, lead_type, job_title, job_function, job_level, direct_number, industry, company_number, employee_size, address, state, country, zip_code, founded_years, founded_years_link, revenue_range, revenue_link, contact_linkedin_url, company_linkedin_url, scored, scored_timezone, appointment, appointment_timezone, lead_tagging, lead_disposition";
const leadsSelectExtended =
  leadsSelectBase +
  ", salutation, first_name, last_name, domain, phone_number_link, department, job_title_link, tenurity, vv_status, email_status, ev_tool, see_all_employees, employee_size_link, company_website_link, sic_code, sic_code_link, naics_code, naics_code_link, ra_comment, special_comments, call_back, call_notes, primary_reason, secondary_reason, qa_comments, cq1, cq2, cq3, cq4, cq5, audit_date, qa_name, qa_audited_by_id, qa_audited_at, asset_title, asset_title2, address2, address_link, actual_employee_size, industry_type_link, delivery_status, delivery_remark, delivered_at, delivered_by, rectification_status, rectification_qa_name, rectification_date";

export type QaCampaignRow = {
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
  lead_aggregated?: string | null;
  leads: Record<string, unknown>[];
  last_lead_activity_at: string | null;
  leads_uploaded: number;
  leads_audited: number;
  leads_pending_audit: number;
  leads_qualified: number;
  leads_rectified: number;
  leads_disqualified: number;
  leads_delivered: number;
};

export type QaCampaignsSummary = {
  total_leads_uploaded: number;
  total_audited: number;
  pending_audit: number;
  campaign_count: number;
};

export type QaCampaignsListResult = {
  campaigns: QaCampaignRow[];
  summary: QaCampaignsSummary;
};

export type QaLeadUploadRange = { startUtc: string; endUtc: string };

export type ScoredLeadsFetchMode = "audit" | "full";

/** Paginated fetch — Supabase returns at most 1000 rows per request. */
export async function fetchScoredLeadsForCampaigns(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[],
  uploadRange?: QaLeadUploadRange,
  mode: ScoredLeadsFetchMode = "full"
): Promise<Record<string, unknown>[]> {
  if (campaignIds.length === 0) return [];

  const chunks = chunkIds(campaignIds);
  let useExtendedSelect = mode === "full";

  if (mode === "full" && useExtendedSelect) {
    // Resolve the missing-column fallback ONCE, before any real accumulation
    // starts — a schema mismatch is deterministic (not data-dependent), so
    // probing on the first chunk is equivalent to probing on any of them.
    // This avoids resetting `all` mid-fetch, which would silently drop rows
    // already collected from earlier chunks if the error ever surfaced later.
    const probeSelect =
      leadsSelectExtended + ", disqualification_reasons, disqualification_reason, rectified_reason";
    const { error: probeError } = await applyScoredLeadTaggingFilter(
      supabase
        .from("leads")
        .select(probeSelect)
        .eq("organization_id", orgId)
        .in("campaign_id", chunks[0])
    ).limit(1);

    if (probeError?.message?.includes("column") || probeError?.message?.includes("disqualification")) {
      useExtendedSelect = false;
    }
  }

  const all: Record<string, unknown>[] = [];

  for (const idChunk of chunks) {
    let offset = 0;

    for (;;) {
      const select =
        mode === "audit"
          ? LEADS_SELECT_AUDIT
          : useExtendedSelect
            ? leadsSelectExtended +
              ", disqualification_reasons, disqualification_reason, rectified_reason"
            : leadsSelectBase +
              ", disqualification_reasons, disqualification_reason, rectified_reason";

      let query = applyScoredLeadTaggingFilter(
        supabase
          .from("leads")
          .select(select)
          .eq("organization_id", orgId)
          .in("campaign_id", idChunk)
      );

      if (uploadRange) {
        query = query
          .gte("created_at", uploadRange.startUtc)
          .lte("created_at", uploadRange.endUtc);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + LEADS_PAGE_SIZE - 1);

      if (error) throw new Error(error.message);

      const page = (data ?? []) as unknown as Record<string, unknown>[];
      if (mode === "audit") {
        for (const row of page) all.push(row);
      } else {
        for (const row of page) {
          all.push({
            ...row,
            disqualification_reasons: (row.disqualification_reasons as string | null) ?? null,
            disqualification_reason: (row.disqualification_reason as string | null) ?? null,
            rectified_reason: (row.rectified_reason as string | null) ?? null,
          });
        }
      }
      if (page.length < LEADS_PAGE_SIZE) break;
      offset += LEADS_PAGE_SIZE;
    }
  }

  return all;
}

function escapeIlikePattern(value: string): string {
  return value.replace(/%/g, "").replace(/_/g, "");
}

function groupLeadsByCampaign(
  campaignIds: string[],
  leads: Record<string, unknown>[]
): Record<string, Record<string, unknown>[]> {
  const leadsByCampaign: Record<string, Record<string, unknown>[]> = {};
  for (const id of campaignIds) {
    leadsByCampaign[id] = [];
  }
  for (const l of leads) {
    const cid = l.campaign_id as string;
    if (leadsByCampaign[cid]) {
      leadsByCampaign[cid].push(l);
    }
  }
  return leadsByCampaign;
}

function activityMsFromLeads(leads: Record<string, unknown>[]): number {
  let activityMs = 0;
  for (const l of leads) {
    const createdMs = new Date(String(l.created_at)).getTime();
    const updatedMs = new Date(String(l.updated_at ?? l.created_at)).getTime();
    const ms = Math.max(
      Number.isFinite(createdMs) ? createdMs : 0,
      Number.isFinite(updatedMs) ? updatedMs : 0
    );
    if (ms > activityMs) activityMs = ms;
  }
  return activityMs;
}

export async function loadQaCampaignsForDateRange(
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
  }
): Promise<QaCampaignsListResult & { pagination?: ReturnType<typeof buildPaginationMeta> }> {
  const page = Math.max(1, options?.page ?? 1);
  const campaignIdFilter = (options?.campaignIds ?? []).filter(Boolean);
  const maxLimit = campaignIdFilter.length > 0 ? 500 : 100;
  const limit = Math.max(1, Math.min(maxLimit, options?.limit ?? 10));
  const includeLeads = options?.includeLeads ?? false;
  const offset = (page - 1) * limit;
  const searchRaw = (options?.q ?? "").trim();
  const statusFilter = (options?.status ?? "").trim() || null;

  let campaignsQuery = supabase
    .from("campaigns")
    .select(`
      id, campaign_id, campaign_code, name, client_name, description, industry, geography, target_designation, lead_type, status,
      start_date, end_date, created_at, cpl, revenue, booked, total_allocation, post_qa, achieved, pending_allocation,
      weekly_call, weekly_report, additional_comments, assigned_team_leader_id,
           employee_size, revenue_size, abm, seniority, job_function, creatives_url, lead_aggregated

    `)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (campaignIdFilter.length > 0) {
    campaignsQuery = campaignsQuery.in("id", campaignIdFilter);
  }

  if (statusFilter) {
    campaignsQuery = campaignsQuery.eq("status", statusFilter);
  }

  if (searchRaw.length > 0) {
    const safe = escapeIlikePattern(searchRaw);
    if (safe.length > 0) {
      campaignsQuery = campaignsQuery.or(
        `name.ilike.%${safe}%,campaign_code.ilike.%${safe}%,client_name.ilike.%${safe}%,description.ilike.%${safe}%,lead_type.ilike.%${safe}%,industry.ilike.%${safe}%,geography.ilike.%${safe}%`
      );
    }
  }

  const { data: campaigns, error: campaignsError } = await campaignsQuery;

  if (campaignsError) throw new Error(campaignsError.message);

  const campaignsList = (campaigns ?? []) as Omit<
    QaCampaignRow,
    | "leads"
    | "last_lead_activity_at"
    | "leads_uploaded"
    | "leads_audited"
    | "leads_pending_audit"
    | "leads_qualified"
    | "leads_rectified"
    | "leads_disqualified"
    | "leads_delivered"
    | "assigned_team_leader_name"
  >[];

  if (campaignsList.length === 0) {
    return {
      campaigns: [],
      summary: {
        total_leads_uploaded: 0,
        total_audited: 0,
        pending_audit: 0,
        campaign_count: 0,
      },
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

  // List/KPI path: audit columns only (not the 80+ column export select).
  const auditLeads = await fetchScoredLeadsForCampaigns(
    supabase,
    orgId,
    campaignIds,
    { startUtc, endUtc },
    "audit"
  );
  const auditByCampaign = groupLeadsByCampaign(campaignIds, auditLeads);

  const visible: QaCampaignRow[] = [];

  for (const c of campaignsList) {
    const leads = auditByCampaign[c.id] ?? [];
    const activityMs = activityMsFromLeads(leads);

    visible.push({
      ...c,
      assigned_team_leader_name: c.assigned_team_leader_id
        ? tlNames[c.assigned_team_leader_id] ?? null
        : null,
      leads,
      last_lead_activity_at: activityMs > 0 ? new Date(activityMs).toISOString() : null,
      leads_uploaded: leads.length,
      leads_audited: countAuditedLeads(leads as { qa_status?: string | null }[]),
      leads_pending_audit: countPendingAuditLeads(leads as { qa_status?: string | null }[]),
      leads_qualified: countQualifiedLeads(leads as { qa_status?: string | null }[]),
      leads_rectified: countRectifiedLeads(leads),
      leads_disqualified: countDisqualifiedLeads(leads as { qa_status?: string | null }[]),
      leads_delivered: countDeliveredLeads(leads),
    });
  }

  visible.sort((a, b) => {
    const aHasUploads = (a.leads_uploaded ?? 0) > 0;
    const bHasUploads = (b.leads_uploaded ?? 0) > 0;
    if (aHasUploads !== bHasUploads) return aHasUploads ? -1 : 1;

    const aMs = a.last_lead_activity_at ? new Date(a.last_lead_activity_at).getTime() : 0;
    const bMs = b.last_lead_activity_at ? new Date(b.last_lead_activity_at).getTime() : 0;
    if (bMs !== aMs) return bMs - aMs;
    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bCreated - aCreated;
  });

  const summary: QaCampaignsSummary = {
    total_leads_uploaded: auditLeads.length,
    total_audited: countAuditedLeads(auditLeads as { qa_status?: string | null }[]),
    pending_audit: countPendingAuditLeads(auditLeads as { qa_status?: string | null }[]),
    campaign_count: visible.filter((c) => (c.leads_uploaded ?? 0) > 0).length,
  };

  const pageSlice = visible.slice(offset, offset + limit);

  if (!includeLeads) {
    return {
      campaigns: pageSlice.map((c) => ({ ...c, leads: [] as Record<string, unknown>[] })),
      summary,
      pagination: buildPaginationMeta(page, limit, visible.length),
    };
  }

  // Export path: full rows only for the page/selected campaigns.
  const exportIds = pageSlice.map((c) => c.id);
  const fullLeads = await fetchScoredLeadsForCampaigns(
    supabase,
    orgId,
    exportIds,
    { startUtc, endUtc },
    "full"
  );
  const fullWithNames = await enrichLeadsWithCreatorNames(supabase, fullLeads, orgId);
  const fullByCampaign = groupLeadsByCampaign(exportIds, fullWithNames);

  return {
    campaigns: pageSlice.map((c) => ({
      ...c,
      leads: fullByCampaign[c.id] ?? [],
    })),
    summary,
    pagination: buildPaginationMeta(page, limit, visible.length),
  };
}
