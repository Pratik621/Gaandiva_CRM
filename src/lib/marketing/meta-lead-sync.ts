import type { AdminClient } from "@/lib/supabase/admin";
import { graphGetAll, resolveStoredMetaPage, MetaGraphError } from "./meta-graph";
import {
  NAME_HEADER_ALIASES,
  PHONE_HEADER_ALIASES,
  EMAIL_HEADER_ALIASES,
  COMPANY_HEADER_ALIASES,
  findValueByAliases,
  normalizePhone,
} from "./sheet-sync";
import { fetchAllRows } from "./fetch-all";

export interface MetaSource {
  id: string;
  organization_id: string;
  access_token: string;
  /** null = status-updates-only token (Conversions API), never synced. */
  page_id: string | null;
  label: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
}

export const META_SOURCE_COLUMNS =
  "id, organization_id, access_token, page_id, label, last_synced_at, last_sync_status";

/** Per-form outcome, stored on the source as discovered_forms and shown to sm_marketing. */
export interface MetaFormSyncResult {
  id: string;
  name: string | null;
  status: string | null;
  leads_read: number;
  imported: number;
  duplicates: number;
  error: string | null;
}

export interface MetaSyncResult {
  /** false when the Page / form list couldn't be read or any form failed. */
  ok: boolean;
  rowsRead: number;
  campaignsUpserted: number;
  leadsInserted: number;
  /** Leads Meta returned that were already in the CRM (by Meta lead id or phone/email). */
  skippedDuplicates: number;
  /** Of skippedDuplicates: existing sheet/manual leads matched by phone/email and linked to their Meta lead id. */
  linkedExisting: number;
  formsProcessed: number;
  errors: number;
  forms: MetaFormSyncResult[];
  /** The Facebook Page actually read, as verified with Meta. */
  page: { id: string; name: string | null } | null;
  /** Set when the stored Page ID wasn't a reachable Page and was replaced by the discovered one. */
  pageCorrectedFrom: string | null;
  error?: string;
}

interface MetaForm {
  id: string;
  name?: string;
  status?: string;
}

interface MetaLead {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  platform?: string;
  is_organic?: boolean;
  field_data?: { name: string; values?: string[] }[];
}

interface CollectedLead {
  lead: MetaLead;
  form: MetaForm;
  raw: Record<string, string>;
}

const FULL_LEAD_FIELDS =
  "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform,is_organic";
// Ad/campaign names need ads_read on top of leads_retrieval — fall back to
// just the lead itself rather than failing the whole sync without it.
const BASIC_LEAD_FIELDS = "id,created_time,field_data,ad_id,campaign_id,platform,is_organic";

// Re-read a little before the last successful sync so leads created while
// that sync was running aren't missed; dedupe on meta_lead_id absorbs overlap.
const INCREMENTAL_OVERLAP_SECONDS = 3600;

const UNIQUE_VIOLATION = "23505";

function emptyResult(error: string): MetaSyncResult {
  return {
    ok: false,
    rowsRead: 0,
    campaignsUpserted: 0,
    leadsInserted: 0,
    skippedDuplicates: 0,
    linkedExisting: 0,
    formsProcessed: 0,
    errors: 1,
    forms: [],
    page: null,
    pageCorrectedFrom: null,
    error,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Meta request failed";
}

/** Every page of a form's leads — graphGetAll follows paging.next to the end. */
async function fetchFormLeads(formId: string, pageToken: string, sinceUnix: number | null): Promise<MetaLead[]> {
  const params: Record<string, string> = { limit: "500" };
  if (sinceUnix) {
    params.filtering = JSON.stringify([
      { field: "time_created", operator: "GREATER_THAN", value: sinceUnix },
    ]);
  }
  try {
    return await graphGetAll<MetaLead>(`${formId}/leads`, pageToken, { ...params, fields: FULL_LEAD_FIELDS });
  } catch (err) {
    if (!(err instanceof MetaGraphError)) throw err;
    return graphGetAll<MetaLead>(`${formId}/leads`, pageToken, { ...params, fields: BASIC_LEAD_FIELDS });
  }
}

/**
 * Flattens a Graph API lead into the same raw_data shape a Meta Lead Ads
 * sheet export produces (id, ad_name, campaign_name, full_name, ...), so the
 * existing lead UI (ad name, property, Additional Details) works unchanged.
 */
function leadToRawData(lead: MetaLead, form: MetaForm): Record<string, string> {
  const row: Record<string, string> = {
    id: lead.id,
    created_time: lead.created_time ?? "",
    ad_id: lead.ad_id ?? "",
    ad_name: lead.ad_name ?? "",
    adset_id: lead.adset_id ?? "",
    adset_name: lead.adset_name ?? "",
    campaign_id: lead.campaign_id ?? "",
    campaign_name: lead.campaign_name ?? "",
    form_id: form.id,
    form_name: form.name ?? "",
    platform: lead.platform ?? "",
    is_organic: lead.is_organic === undefined ? "" : String(lead.is_organic),
  };
  for (const field of lead.field_data ?? []) {
    row[field.name] = (field.values ?? []).join(", ");
  }
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== ""));
}

function leadName(row: Record<string, string>): string | null {
  const name = findValueByAliases(row, NAME_HEADER_ALIASES);
  if (name) return name;
  const first = findValueByAliases(row, ["first name"]);
  const last = findValueByAliases(row, ["last name"]);
  return [first, last].filter(Boolean).join(" ") || null;
}

/**
 * Meta identifiers for a lead — only what Meta actually returned, never
 * inferred (a form name is not a campaign name). Every key is always present
 * so bulk inserts send the same column set for every row.
 */
function metaColumns(item: CollectedLead, pageId: string) {
  const { lead, form, raw } = item;
  return {
    meta_page_id: pageId,
    meta_form_id: form.id,
    meta_form_name: form.name ?? null,
    meta_campaign_id: lead.campaign_id ?? null,
    meta_campaign_name: lead.campaign_name ?? null,
    meta_adset_id: lead.adset_id ?? null,
    meta_adset_name: lead.adset_name ?? null,
    meta_ad_id: lead.ad_id ?? null,
    meta_ad_name: lead.ad_name ?? null,
    meta_platform: lead.platform ?? null,
    meta_created_time: lead.created_time ? new Date(lead.created_time).toISOString() : null,
    inbox_url: findValueByAliases(raw, ["inbox url"]) || null,
  };
}

/**
 * The CRM grouping a lead lands in. Leads Meta attributes to a campaign are
 * grouped by that campaign id and named from Meta's campaign_name only. Leads
 * with no campaign (organic / test leads, or campaign fields unavailable) are
 * grouped per form — by form id, so two forms that share a name stay separate
 * — and labelled plainly as a lead form, never presented as a campaign.
 */
function groupingFor(item: CollectedLead): { key: string; name: string } {
  const { lead, form } = item;
  if (lead.campaign_id) {
    return { key: lead.campaign_id, name: lead.campaign_name || `Meta campaign ${lead.campaign_id}` };
  }
  return { key: `meta_form:${form.id}`, name: `Lead form: ${form.name || "Untitled"} (${form.id})` };
}

async function findCampaign(admin: AdminClient, organizationId: string, externalCampaignId: string) {
  // Meta's sheet exports prefix campaign ids with "c:" — match either form so
  // the same campaign isn't duplicated when it's fed by both a sheet and the API.
  const { data } = await admin
    .from("simplified_campaigns")
    .select("id, name")
    .eq("organization_id", organizationId)
    .in("external_campaign_id", [externalCampaignId, `c:${externalCampaignId}`])
    .limit(1)
    .maybeSingle();
  return data as { id: string; name: string } | null;
}

async function ensureCampaign(
  admin: AdminClient,
  organizationId: string,
  externalCampaignId: string,
  displayName: string
): Promise<{ id: string; created: boolean } | null> {
  const existing = await findCampaign(admin, organizationId, externalCampaignId);
  if (existing?.id) {
    // Form groups created before this naming rule were titled with the bare
    // form name; relabel so they can't be mistaken for a Meta campaign.
    if (externalCampaignId.startsWith("meta_form:") && existing.name !== displayName) {
      await admin.from("simplified_campaigns").update({ name: displayName } as never).eq("id", existing.id);
    }
    return { id: existing.id, created: false };
  }

  const { data: created, error } = await admin
    .from("simplified_campaigns")
    .insert({
      organization_id: organizationId,
      name: displayName,
      external_campaign_id: externalCampaignId,
      status: "active",
    } as never)
    .select("id")
    .single();

  if (error || !created) {
    // An overlapping sync created it first (unique org + external id) — use theirs.
    const raced = await findCampaign(admin, organizationId, externalCampaignId);
    return raced ? { id: raced.id, created: false } : null;
  }
  return { id: (created as { id: string }).id, created: true };
}

async function loadExistingMetaLeads(
  admin: AdminClient,
  organizationId: string,
  metaIds: string[]
): Promise<Map<string, { id: string; meta_form_id: string | null }>> {
  const found = new Map<string, { id: string; meta_form_id: string | null }>();
  for (let i = 0; i < metaIds.length; i += 200) {
    const { data, error } = await admin
      .from("simplified_leads")
      .select("id, meta_lead_id, meta_form_id")
      .eq("organization_id", organizationId)
      .in("meta_lead_id", metaIds.slice(i, i + 200));
    // Without this lookup we can't tell new leads from existing ones — abort
    // rather than risk treating everything as new.
    if (error) throw new Error(`Could not check existing leads: ${error.message}`);
    for (const row of (data ?? []) as { id: string; meta_lead_id: string; meta_form_id: string | null }[]) {
      found.set(row.meta_lead_id, { id: row.id, meta_form_id: row.meta_form_id });
    }
  }
  return found;
}

function phoneKey(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  // Last 10 digits so "+91 98765 43210" and "9876543210" match; shorter
  // numbers are too ambiguous to match on.
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function emailKey(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value && value.includes("@") ? value : null;
}

/**
 * Leads that came from a Google Sheet / manual entry without a Meta lead id,
 * indexed by phone and email so a Meta lead for the same person links to the
 * existing CRM lead instead of creating a second one.
 */
async function loadUnlinkedContactIndex(admin: AdminClient, organizationId: string) {
  const { data, error } = await fetchAllRows<{ id: string; phone: string | null; email: string | null }>(
    (from, to) =>
      admin
        .from("simplified_leads")
        .select("id, phone, email")
        .eq("organization_id", organizationId)
        .is("meta_lead_id", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to) as never
  );
  if (error) throw new Error(`Could not check existing leads: ${error}`);

  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const row of data) {
    const p = phoneKey(row.phone);
    const e = emailKey(row.email);
    // Oldest lead wins when several share a phone/email.
    if (p && !byPhone.has(p)) byPhone.set(p, row.id);
    if (e && !byEmail.has(e)) byEmail.set(e, row.id);
  }
  return { byPhone, byEmail };
}

/**
 * Pulls every lead (all pages) from every lead form on the source's Page —
 * incrementally after the first fully successful sync — and stores the new
 * ones as status "new", visible to sm_marketing and sm_agent.
 *
 * Idempotent: a Meta lead already in the CRM (same meta_lead_id, enforced by
 * a unique index) is never inserted again, and its status / agent notes are
 * never touched — only missing Meta metadata is filled in. A failing form is
 * recorded and skipped; it never deletes or changes existing leads.
 */
export async function syncMetaSource(admin: AdminClient, source: MetaSource): Promise<MetaSyncResult> {
  if (!source.page_id) return emptyResult("Status-only token — no Page to read leads from");

  // Always the Page Meta verifies/discovers for this token — a stored ID that
  // isn't a reachable Page is corrected here rather than trusted.
  let pageId: string;
  let page: { id: string; name: string | null };
  let pageCorrectedFrom: string | null;
  let pageToken: string;
  let forms: MetaForm[];
  try {
    const resolved = await resolveStoredMetaPage(source.access_token, source.page_id);
    pageId = resolved.pageId;
    page = { id: resolved.pageId, name: resolved.pageName };
    pageCorrectedFrom = resolved.correctedFrom;
    pageToken = resolved.pageToken;
    forms = await graphGetAll<MetaForm>(`${pageId}/leadgen_forms`, pageToken, {
      fields: "id,name,status",
      limit: "100",
    });
  } catch (err) {
    return emptyResult(`Could not read the Page's lead forms: ${errorMessage(err)}`);
  }

  const sinceUnix =
    source.last_sync_status === "success" && source.last_synced_at
      ? Math.floor(new Date(source.last_synced_at).getTime() / 1000) - INCREMENTAL_OVERLAP_SECONDS
      : null;

  const formResults = new Map<string, MetaFormSyncResult>();
  const collected = new Map<string, CollectedLead>();
  for (const form of forms) {
    const formResult: MetaFormSyncResult = {
      id: form.id,
      name: form.name ?? null,
      status: form.status ?? null,
      leads_read: 0,
      imported: 0,
      duplicates: 0,
      error: null,
    };
    formResults.set(form.id, formResult);
    try {
      const leads = await fetchFormLeads(form.id, pageToken, sinceUnix);
      formResult.leads_read = leads.length;
      for (const lead of leads) {
        if (!collected.has(lead.id)) collected.set(lead.id, { lead, form, raw: leadToRawData(lead, form) });
      }
    } catch (err) {
      formResult.error = errorMessage(err);
    }
  }

  let campaignsUpserted = 0;
  let leadsInserted = 0;
  let skippedDuplicates = 0;
  let linkedExisting = 0;
  let insertErrors = 0;
  const markDuplicate = (item: CollectedLead) => {
    skippedDuplicates += 1;
    formResults.get(item.form.id)!.duplicates += 1;
  };

  try {
    // 1. Already stored by Meta lead id → skip; only backfill missing Meta metadata.
    const existing = await loadExistingMetaLeads(admin, source.organization_id, [...collected.keys()]);
    const candidates: CollectedLead[] = [];
    for (const item of collected.values()) {
      const match = existing.get(item.lead.id);
      if (!match) {
        candidates.push(item);
        continue;
      }
      markDuplicate(item);
      if (!match.meta_form_id) {
        await admin.from("simplified_leads").update(metaColumns(item, pageId) as never).eq("id", match.id);
      }
    }

    // 2. Same person already in the CRM from a sheet/manual entry (phone or
    //    email) → link that lead to its Meta lead id instead of duplicating it.
    //    Status, notes and contact fields of the existing lead are untouched.
    const toInsert: CollectedLead[] = [];
    if (candidates.length > 0) {
      const index = await loadUnlinkedContactIndex(admin, source.organization_id);
      for (const item of candidates) {
        const p = phoneKey(normalizePhone(findValueByAliases(item.raw, PHONE_HEADER_ALIASES)));
        const e = emailKey(findValueByAliases(item.raw, EMAIL_HEADER_ALIASES));
        const matchId = (p && index.byPhone.get(p)) || (e && index.byEmail.get(e)) || null;
        if (!matchId) {
          toInsert.push(item);
          continue;
        }
        const { data: linked, error } = await admin
          .from("simplified_leads")
          .update({ meta_lead_id: item.lead.id, ...metaColumns(item, pageId) } as never)
          .eq("id", matchId)
          .is("meta_lead_id", null)
          .select("id");
        if (error?.code === UNIQUE_VIOLATION) {
          // An overlapping sync already stored this Meta lead.
          markDuplicate(item);
        } else if (error || !linked || linked.length === 0) {
          // Lead was linked to another Meta lead in the meantime — insert this
          // one normally (the meta_lead_id unique index still guards it).
          toInsert.push(item);
        } else {
          markDuplicate(item);
          linkedExisting += 1;
        }
        for (const [key, id] of index.byPhone) if (id === matchId) index.byPhone.delete(key);
        for (const [key, id] of index.byEmail) if (id === matchId) index.byEmail.delete(key);
      }
    }

    // 3. Genuinely new → insert as status "new", grouped per Meta campaign / form.
    const groups = new Map<string, { name: string; items: CollectedLead[] }>();
    for (const item of toInsert) {
      const { key, name } = groupingFor(item);
      const group = groups.get(key) ?? { name, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }

    for (const [externalCampaignId, group] of groups) {
      const campaign = await ensureCampaign(admin, source.organization_id, externalCampaignId, group.name);
      if (!campaign) {
        insertErrors += group.items.length;
        for (const item of group.items) {
          formResults.get(item.form.id)!.error ??= "Could not create the CRM group for these leads";
        }
        continue;
      }
      if (campaign.created) campaignsUpserted += 1;

      const rows = group.items.map((item) => ({
        organization_id: source.organization_id,
        simplified_campaign_id: campaign.id,
        source: "meta",
        meta_lead_id: item.lead.id,
        ...metaColumns(item, pageId),
        name: leadName(item.raw),
        phone: normalizePhone(findValueByAliases(item.raw, PHONE_HEADER_ALIASES)),
        email: findValueByAliases(item.raw, EMAIL_HEADER_ALIASES),
        company_name: findValueByAliases(item.raw, COMPANY_HEADER_ALIASES),
        raw_data: item.raw,
        source_row_hash: `id:${item.lead.id}`,
        status: "new",
        // Always set (never undefined): in a bulk insert a missing key is
        // sent as NULL, not the column default.
        created_at: item.lead.created_time
          ? new Date(item.lead.created_time).toISOString()
          : new Date().toISOString(),
      }));

      for (let i = 0; i < rows.length; i += 500) {
        const chunkRows = rows.slice(i, i + 500);
        const chunkItems = group.items.slice(i, i + 500);
        const { data, error } = await admin.from("simplified_leads").insert(chunkRows as never).select("id");
        if (!error) {
          leadsInserted += data?.length ?? 0;
          for (const item of chunkItems) formResults.get(item.form.id)!.imported += 1;
          continue;
        }
        // An overlapping sync may have inserted some of these already — retry
        // row by row so one unique-index conflict doesn't drop the whole chunk.
        for (let j = 0; j < chunkRows.length; j += 1) {
          const { error: rowError } = await admin.from("simplified_leads").insert(chunkRows[j] as never);
          const item = chunkItems[j];
          if (!rowError) {
            leadsInserted += 1;
            formResults.get(item.form.id)!.imported += 1;
          } else if (rowError.code === UNIQUE_VIOLATION) {
            markDuplicate(item);
          } else {
            insertErrors += 1;
            formResults.get(item.form.id)!.error ??= `Could not save lead: ${rowError.message}`;
          }
        }
      }
    }
  } catch (err) {
    const forms = [...formResults.values()];
    return {
      ok: false,
      rowsRead: collected.size,
      campaignsUpserted,
      leadsInserted,
      skippedDuplicates,
      linkedExisting,
      formsProcessed: forms.length,
      errors: forms.filter((f) => f.error).length + 1,
      forms,
      page,
      pageCorrectedFrom,
      error: errorMessage(err),
    };
  }

  const formList = [...formResults.values()];
  const failedForms = formList.filter((f) => f.error);
  const errors = failedForms.length + (insertErrors > 0 && failedForms.length === 0 ? 1 : 0);
  return {
    ok: errors === 0,
    rowsRead: collected.size,
    campaignsUpserted,
    leadsInserted,
    skippedDuplicates,
    linkedExisting,
    formsProcessed: formList.length,
    errors,
    forms: formList,
    page,
    pageCorrectedFrom,
    error: failedForms.length
      ? `${failedForms.length} form(s) failed: ${failedForms.map((f) => `${f.name || f.id} — ${f.error}`).join("; ")}`
      : insertErrors > 0
        ? `${insertErrors} lead(s) could not be saved`
        : undefined,
  };
}

/** Runs syncMetaSource and records the outcome + statistics on the source row. */
export async function syncAndRecordMetaSource(admin: AdminClient, source: MetaSource): Promise<MetaSyncResult> {
  const startedAt = new Date().toISOString();
  const result = await syncMetaSource(admin, source);

  const update: Record<string, unknown> = {
    // Only a fully successful sync advances the incremental window (stamped
    // with the start time so leads created mid-sync aren't skipped). After any
    // failure the next run re-reads everything; dedupe absorbs the overlap.
    last_synced_at: result.ok ? startedAt : source.last_synced_at,
    last_sync_status: result.ok ? "success" : "error",
    last_sync_error: result.error ?? null,
    last_sync_leads: result.leadsInserted,
    last_sync_duplicates: result.skippedDuplicates,
    last_sync_forms: result.formsProcessed,
    last_sync_errors: result.errors,
  };
  // Keep the last known form list when Meta couldn't be reached at all.
  if (result.forms.length > 0) update.discovered_forms = result.forms;
  // Persist the verified Page (fixes a stored ID that wasn't a real Page).
  if (result.page) {
    update.page_id = result.page.id;
    update.page_name = result.page.name;
  }

  const { error } = await admin.from("simplified_meta_sources").update(update as never).eq("id", source.id);
  if (error && result.page && result.page.id !== source.page_id) {
    // Another connection already holds the correct Page (unique org + page):
    // record the stats but keep this row's Page ID, and say why.
    delete update.page_id;
    delete update.page_name;
    update.last_sync_error = `${result.error ? `${result.error}. ` : ""}The correct Page ${result.page.id} is already connected in another Meta connection — remove this one.`;
    await admin.from("simplified_meta_sources").update(update as never).eq("id", source.id);
  }

  return result;
}
