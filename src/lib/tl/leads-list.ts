import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POSTGREST_IN_CHUNK_SIZE,
  chunkIds,
  fetchAllByIdChunks,
} from "@/lib/supabase/in-chunks";

const LEADS_PAGE_SIZE = 1000;

const LEADS_SELECT_BASE =
  "id, lead_id, campaign_id, name, company_name, phone, email, city, status, followup_date, notes, assigned_agent_id, created_by, creator_display_name, created_at, updated_at, lead_type, job_title, job_function, job_level, direct_number, industry, company_number, employee_size, address, state, country, zip_code, founded_years, founded_years_link, revenue_range, revenue_link, contact_linkedin_url, company_linkedin_url, scored, scored_timezone, appointment, appointment_timezone, lead_tagging, lead_disposition, delivery_status, delivered_at, delivered_by";

const LEADS_SELECT_EXTENDED =
  LEADS_SELECT_BASE +
  ", salutation, first_name, last_name, domain, phone_number_link, department, job_title_link, tenurity, vv_status, email_status, ev_tool, see_all_employees, employee_size_link, company_website_link, sic_code, sic_code_link, naics_code, naics_code_link, ra_comment, special_comments, call_back, call_notes, primary_reason, secondary_reason, qa_comments, cq1, cq2, cq3, cq4, cq5, extra_cq, audit_date, qa_name, qa_audited_by_id, qa_audited_at, asset_title, asset_title2, address2, address_link, actual_employee_size, industry_type_link, delivery_remark, rectification_status, rectification_qa_name, rectification_date, channel";

const QA_EXTRA =
  ", qa_status, disqualification_reasons, disqualification_reason, rectified_reason";

export const TL_LEADS_LIST_SELECT = LEADS_SELECT_EXTENDED + QA_EXTRA;

function isMissingColumnError(message: string | undefined): boolean {
  return Boolean(message?.includes("column") || message?.includes("qa_status"));
}

/** Server-side QA filter for TL leads list (`pending` = empty/null qa_status). */
export function applyTlLeadsQaStatusFilter<
  TQuery extends { or: (filter: string) => TQuery; eq: (column: string, value: string) => TQuery },
>(query: TQuery, qaStatus?: string): TQuery {
  if (!qaStatus?.trim()) return query;
  const normalized = qaStatus.trim().toLowerCase();
  if (normalized === "pending" || normalized === "pending_audit") {
    return query.or("qa_status.is.null,qa_status.eq.");
  }
  return query.eq("qa_status", normalized);
}

function createdAtDesc(a: Record<string, unknown>, b: Record<string, unknown>): number {
  return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
}

type PageOpts = {
  campaignIds: string[];
  offset: number;
  limit: number;
  search?: string;
  select?: string;
  organizationId?: string;
  agentIds?: string[];
  includeUnassigned?: boolean;
  dateFrom?: string;
  dateTo?: string;
  qaStatus?: string;
  deliveryStatus?: string;
};

/** Paginated fetch — Supabase returns at most 1000 rows per request. */
export async function fetchTlLeadsForCampaigns(
  supabase: SupabaseClient,
  campaignIds: string[],
  organizationId?: string
): Promise<Record<string, unknown>[]> {
  if (campaignIds.length === 0) return [];

  const loadWithSelect = async (select: string) =>
    fetchAllByIdChunks<Record<string, unknown>>(campaignIds, async (idChunk, from, to) => {
      let query = supabase
        .from("leads")
        .select(select)
        .in("campaign_id", idChunk)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      const { data, error } = await query;
      return {
        data: (data as Record<string, unknown>[] | null) ?? null,
        error: error ? { message: error.message } : null,
      };
    });

  try {
    return await loadWithSelect(LEADS_SELECT_EXTENDED + QA_EXTRA);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingColumnError(message)) {
      return loadWithSelect(LEADS_SELECT_BASE + QA_EXTRA);
    }
    throw err;
  }
}

async function fetchTlLeadsPageForCampaignIdChunk(
  supabase: SupabaseClient,
  opts: PageOpts & { campaignIds: string[]; select: string }
): Promise<{ rows: Record<string, unknown>[]; total: number; missingColumn: boolean }> {
  let query = supabase
    .from("leads")
    .select(opts.select, { count: "exact" })
    .in("campaign_id", opts.campaignIds)
    .order("created_at", { ascending: false });

  if (opts.organizationId) {
    query = query.eq("organization_id", opts.organizationId);
  }

  if (opts.search) {
    const safe = opts.search.replace(/%/g, "").replace(/_/g, "");
    if (safe.length > 0) {
      query = query.or(
        `name.ilike.%${safe}%,company_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,lead_id.ilike.%${safe}%`
      );
    }
  }

  const realAgentIds = (opts.agentIds ?? []).filter(Boolean);
  if (realAgentIds.length > 0 && opts.includeUnassigned) {
    const idList = realAgentIds.map((id) => `"${id}"`).join(",");
    query = query.or(`assigned_agent_id.is.null,assigned_agent_id.in.(${idList})`);
  } else if (realAgentIds.length > 0) {
    query = query.in("assigned_agent_id", realAgentIds);
  } else if (opts.includeUnassigned) {
    query = query.is("assigned_agent_id", null);
  }

  if (opts.dateFrom) {
    query = query.gte("created_at", `${opts.dateFrom}T00:00:00.000Z`);
  }
  if (opts.dateTo) {
    query = query.lte("created_at", `${opts.dateTo}T23:59:59.999Z`);
  }

  query = applyTlLeadsQaStatusFilter(query, opts.qaStatus);

  if (opts.deliveryStatus?.trim()) {
  query = query.eq("delivery_status", opts.deliveryStatus.trim().toLowerCase());
}

  const { data, error, count } = await query.range(opts.offset, opts.offset + opts.limit - 1);

  if (error && isMissingColumnError(error.message)) {
    return { rows: [], total: 0, missingColumn: true };
  }
  if (error) throw new Error(error.message);

  return {
    rows: (data ?? []) as unknown as Record<string, unknown>[],
    total: count ?? 0,
    missingColumn: false,
  };
}

/** Single-page fetch with total count for TL org leads list API. */
export async function fetchTlLeadsPageForCampaigns(
  supabase: SupabaseClient,
  opts: PageOpts
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const { campaignIds, offset, limit } = opts;
  if (campaignIds.length === 0) return { rows: [], total: 0 };

  let useExtendedSelect = true;
  let select = opts.select ?? TL_LEADS_LIST_SELECT;

  for (let attempt = 0; attempt < 2; attempt++) {
    // Small lists: one PostgREST query (preserves exact server-side pagination).
    if (campaignIds.length <= POSTGREST_IN_CHUNK_SIZE) {
      const page = await fetchTlLeadsPageForCampaignIdChunk(supabase, {
        ...opts,
        select,
      });
      if (page.missingColumn && useExtendedSelect) {
        useExtendedSelect = false;
        select = LEADS_SELECT_BASE + QA_EXTRA;
        continue;
      }
      return { rows: page.rows, total: page.total };
    }

    // Large campaign ID lists: chunk `.in()` and merge-sort for the requested page.
    // Each chunk fetches the first (offset+limit) rows so global ordering stays correct.
    const take = offset + limit;
    const idChunks = chunkIds(campaignIds);
    const partials = await Promise.all(
      idChunks.map((idChunk) =>
        fetchTlLeadsPageForCampaignIdChunk(supabase, {
          ...opts,
          campaignIds: idChunk,
          offset: 0,
          limit: take,
          select,
        })
      )
    );

    if (partials.some((p) => p.missingColumn) && useExtendedSelect) {
      useExtendedSelect = false;
      select = LEADS_SELECT_BASE + QA_EXTRA;
      continue;
    }

    const total = partials.reduce((sum, p) => sum + p.total, 0);
    const merged = partials.flatMap((p) => p.rows).sort(createdAtDesc);
    return {
      rows: merged.slice(offset, offset + limit),
      total,
    };
  }

  return { rows: [], total: 0 };
}

type TlLeadsListQueryOpts = Omit<
  Parameters<typeof fetchTlLeadsPageForCampaigns>[1],
  "offset" | "limit"
>;

/** All matching leads (paginated internally) — for export. */
export async function fetchAllTlLeadsForCampaigns(
  supabase: SupabaseClient,
  opts: TlLeadsListQueryOpts
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  if (opts.campaignIds.length === 0) return { rows: [], total: 0 };

  // Walk each campaign-id chunk fully so export isn't truncated by merge-page logic.
  const all: Record<string, unknown>[] = [];
  let total = 0;

  for (const idChunk of chunkIds(opts.campaignIds)) {
    let offset = 0;
    let chunkTotal = 0;
    let fetchedForChunk = 0;
    for (;;) {
      const page = await fetchTlLeadsPageForCampaigns(supabase, {
        ...opts,
        campaignIds: idChunk,
        offset,
        limit: LEADS_PAGE_SIZE,
      });
      chunkTotal = page.total;
      all.push(...page.rows);
      fetchedForChunk += page.rows.length;
      if (page.rows.length < LEADS_PAGE_SIZE || fetchedForChunk >= chunkTotal) break;
      offset += LEADS_PAGE_SIZE;
    }
    total += chunkTotal;
  }

  all.sort(createdAtDesc);
  return { rows: all, total };
}
