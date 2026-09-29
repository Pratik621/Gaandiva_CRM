import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCallLogsClientSafe, CALL_LOGS_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/call-logs";

/**
 * Agent leads stored in the separate Call Logs Supabase project (demo).
 * Enabled per agent email + campaign via env:
 *   CALLLOGS_LEADS_AGENT_EMAILS=agentone@gmail.com
 *   CALLLOGS_LEADS_CAMPAIGN_IDS=d1476fb9-875b-4cf7-bbc3-8432027abb49
 * When enabled, lead rows are read/written ONLY in the Call Logs DB; the main
 * DB is used just for the existing auth / campaign-assignment checks.
 */

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function isCallLogsLeadsTarget(
  userEmail: string | null | undefined,
  campaignId: string | null | undefined
): boolean {
  if (!userEmail || !campaignId) return false;
  return (
    envList("CALLLOGS_LEADS_AGENT_EMAILS").includes(userEmail.trim().toLowerCase()) &&
    envList("CALLLOGS_LEADS_CAMPAIGN_IDS").includes(campaignId.trim().toLowerCase())
  );
}

/**
 * Demand & Qualification questions hidden for the Call Logs demo agent/campaign
 * (matched by the start of the question text; case, punctuation and dashes ignored).
 */
const CALL_LOGS_HIDDEN_QUESTION_PREFIXES = [
  "if you explore alternative options",
  "follow up where do you see the most value",
];

const normalizeQuestionText = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function hideCallLogsDemoQuestions<T extends { label: string }>(questions: T[]): T[] {
  return questions.filter((q) => {
    const label = normalizeQuestionText(q.label);
    return !CALL_LOGS_HIDDEN_QUESTION_PREFIXES.some((prefix) => label.startsWith(prefix));
  });
}

/** Columns of public.leads in the Call Logs DB (supabase-call-logs/migrations). */
const CALL_LOGS_LEAD_COLUMNS = new Set([
  "id", "lead_id", "organization_id", "campaign_id", "assigned_agent_id", "created_by",
  "creator_display_name", "status", "lead_type", "lead_tagging", "lead_disposition", "channel",
  "consent_status", "salutation", "name", "first_name", "last_name", "email", "email_status",
  "ev_tool", "phone", "direct_number", "phone_number_link", "job_title", "job_title_link",
  "job_function", "job_level", "department", "tenurity", "vv_status", "contact_linkedin_url",
  "company_name", "domain", "company_number", "company_website_link", "company_linkedin_url",
  "address", "address2", "address_link", "city", "state", "country", "zip_code", "industry",
  "industry_type_link", "employee_size", "actual_employee_size", "employee_size_link",
  "see_all_employees", "founded_years", "founded_years_link", "revenue_range", "revenue_link",
  "sic_code", "sic_code_link", "naics_code", "naics_code_link", "call_back", "call_notes", "notes",
  "followup_date", "ra_comment", "special_comments", "primary_reason", "secondary_reason", "cq1",
  "cq2", "cq3", "cq4", "cq5", "extra_cq", "scored", "scored_timezone", "appointment",
  "appointment_timezone", "qa_status", "qa_name", "qa_comments", "qa_audited_by_id",
  "qa_audited_at", "audit_date", "asset_title", "asset_title2", "disqualification_reasons",
  "disqualification_reason", "rectified_reason", "rectification_status", "rectification_qa_name",
  "rectification_date", "dq_reason_code", "delivery_status", "delivery_remark", "billable_status",
  "risk_flags", "rep_id", "wa_thread_id", "ingested_at", "qualified_at", "registered_at",
  "created_at", "updated_at",
]);

function pickLeadColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (CALL_LOGS_LEAD_COLUMNS.has(key) && value !== undefined) out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Duplicate keys — same rules as main DB lead_duplicate_candidate_keys().
// ---------------------------------------------------------------------------

type DuplicateSource = {
  first_name?: unknown;
  last_name?: unknown;
  company_name?: unknown;
  domain?: unknown;
  contact_linkedin_url?: unknown;
  job_title_link?: unknown;
  email?: unknown;
};

const normText = (v: unknown) => String(v ?? "").trim().toLowerCase();

function normDomain(v: unknown): string {
  let raw = normText(v);
  if (!raw) return "";
  raw = raw.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return raw.split("/")[0].split("?")[0].split("#")[0];
}

function normCompanyBase(v: unknown, isDomain: boolean): string {
  let raw = normText(v);
  if (!raw) return "";
  if (isDomain) {
    raw = normDomain(raw).split(".")[0];
  } else {
    raw = raw.replace(
      /\b(private|pvt|limited|ltd|incorporated|inc|corporation|corp|llc|l\.l\.c|lcc|llp|plc|gmbh)\b\.?/gi,
      " "
    );
  }
  return raw.replace(/[^a-z0-9]/g, "");
}

function normLinkedin(v: unknown): string {
  let raw = normText(v);
  if (!raw) return "";
  raw = raw.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return raw.split("?")[0].split("#")[0].replace(/\/+$/, "");
}

/** Ordered [key, reason] pairs; first match wins, like the main DB. */
function duplicateKeys(row: DuplicateSource): { key: string; reason: string }[] {
  const first = normText(row.first_name);
  const last = normText(row.last_name);
  const email = normText(row.email);
  const linkedin = normLinkedin(row.contact_linkedin_url);
  const jobLink = normLinkedin(row.job_title_link);
  const companyBase = normCompanyBase(row.company_name, false);
  const domainBase = normCompanyBase(row.domain, true);

  const keys: { key: string; reason: string }[] = [];
  if (email) keys.push({ key: `email:${email}`, reason: "Email ID" });
  if (linkedin) keys.push({ key: `li:${linkedin}`, reason: "Prospect LinkedIn URL" });
  if (jobLink) keys.push({ key: `jtl:${jobLink}`, reason: "Job Title Link" });
  if (first && last && companyBase) {
    keys.push({
      key: `fnc:${first}|${last}|${companyBase}`,
      reason: "First Name + Last Name + Company Name",
    });
  }
  if (first && last) {
    for (const base of new Set([companyBase, domainBase])) {
      if (base) {
        keys.push({
          key: `fnd:${first}|${last}|${base}`,
          reason: "First Name + Last Name + Company Domain",
        });
      }
    }
  }
  return keys;
}

type ExistingLead = DuplicateSource & { id: string; lead_id: string | null };

const DUPLICATE_SELECT =
  "id, lead_id, first_name, last_name, company_name, domain, contact_linkedin_url, job_title_link, email";

/** In-memory index of this agent's campaign leads for duplicate checks. */
class DuplicateIndex {
  private byKey = new Map<string, { id: string; lead_id: string | null }>();

  add(lead: ExistingLead) {
    for (const { key } of duplicateKeys(lead)) {
      if (!this.byKey.has(key)) this.byKey.set(key, { id: lead.id, lead_id: lead.lead_id });
    }
  }

  remove(leadId: string) {
    for (const [key, v] of this.byKey) if (v.id === leadId) this.byKey.delete(key);
  }

  find(row: DuplicateSource, excludeId?: string | null) {
    for (const { key, reason } of duplicateKeys(row)) {
      const hit = this.byKey.get(key);
      if (hit && hit.id !== excludeId) return { ...hit, reason };
    }
    return null;
  }
}

async function loadDuplicateIndex(
  db: SupabaseClient,
  campaignId: string,
  agentId: string
): Promise<{ index: DuplicateIndex; leads: ExistingLead[] }> {
  const { data, error } = await db
    .from("leads")
    .select(DUPLICATE_SELECT)
    .eq("campaign_id", campaignId)
    .eq("assigned_agent_id", agentId);
  if (error) throw error;
  const index = new DuplicateIndex();
  const leads = (data ?? []) as ExistingLead[];
  for (const lead of leads) index.add(lead);
  return { index, leads };
}

// ---------------------------------------------------------------------------
// lead_id: LD-{AgentCode}-{Year}-{Seq}, same format as main get_next_lead_id().
// ---------------------------------------------------------------------------

export function agentLeadIdCode(agentId: string, agentCode?: string | null): string {
  const fallback = "A" + agentId.replace(/-/g, "").slice(0, 6).toUpperCase();
  const cleaned = String(agentCode ?? "").replace(/[^A-Za-z0-9]/g, "").trim();
  return (cleaned || fallback).slice(0, 12).toUpperCase();
}

async function createLeadIdGenerator(db: SupabaseClient, agentCode: string) {
  const prefix = `LD-${agentCode}-${new Date().getFullYear()}-`;
  const { data, error } = await db
    .from("leads")
    .select("lead_id")
    .like("lead_id", `${prefix}%`)
    .order("lead_id", { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = (data?.[0] as { lead_id?: string } | undefined)?.lead_id ?? "";
  let seq = Number(last.slice(prefix.length)) || 0;
  return () => `${prefix}${String(++seq).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export type CallLogsLeadContext = {
  db: SupabaseClient;
  orgId: string;
  campaignId: string;
  agentId: string;
  agentCode: string;
};

/**
 * Returns null when this agent/campaign is not routed to the Call Logs DB,
 * a 503 response when it is but the DB is not configured, else the context.
 * `mainDb` is only used to read the agent's agent_code for lead_id format.
 */
export async function resolveCallLogsLeadContext(args: {
  mainDb: SupabaseClient;
  userId: string;
  userEmail: string | null | undefined;
  orgId: string;
  campaignId: string;
}): Promise<CallLogsLeadContext | NextResponse | null> {
  if (!isCallLogsLeadsTarget(args.userEmail, args.campaignId)) return null;
  const db = getCallLogsClientSafe();
  if (!db) {
    return NextResponse.json({ error: CALL_LOGS_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }
  const { data: userRow } = await args.mainDb
    .from("users")
    .select("agent_code")
    .eq("id", args.userId)
    .maybeSingle();
  return {
    db,
    orgId: args.orgId,
    campaignId: args.campaignId,
    agentId: args.userId,
    agentCode: agentLeadIdCode(args.userId, (userRow as { agent_code?: string | null } | null)?.agent_code),
  };
}

export type CallLogsLeadState = "active" | "inactive" | "all";

export function parseCallLogsLeadState(raw: string | null | undefined): CallLogsLeadState {
  return raw === "inactive" || raw === "all" ? raw : "active";
}

/** Postgres "column does not exist" — is_active migration not run yet. */
function isMissingIsActiveColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42703" || /is_active/i.test(error.message ?? ""));
}

export async function listCallLogsLeads(
  ctx: CallLogsLeadContext,
  offset: number,
  limit: number,
  state: CallLogsLeadState = "active"
) {
  const run = (withState: boolean) => {
    let query = ctx.db
      .from("leads")
      .select("*", { count: "exact" })
      .eq("campaign_id", ctx.campaignId)
      .eq("assigned_agent_id", ctx.agentId);
    if (withState && state !== "all") query = query.eq("is_active", state === "active");
    return query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  };

  const result = await run(true);
  // Before 20260929050000_leads_is_active.sql runs every lead counts as active.
  if (isMissingIsActiveColumn(result.error)) {
    if (state === "inactive") return { data: [], error: null, count: 0 };
    return run(false);
  }
  return result;
}

/** Activate / deactivate this agent's leads in the campaign. Returns rows changed. */
export async function setCallLogsLeadsActive(
  ctx: CallLogsLeadContext,
  leadRowIds: string[],
  active: boolean
): Promise<number> {
  const { data, error } = await ctx.db
    .from("leads")
    .update({ is_active: active })
    .in("id", leadRowIds)
    .eq("campaign_id", ctx.campaignId)
    .eq("assigned_agent_id", ctx.agentId)
    .select("id");
  if (isMissingIsActiveColumn(error)) {
    throw new Error("Run supabase-call-logs/migrations/20260929050000_leads_is_active.sql first");
  }
  if (error) throw error;
  return (data ?? []).length;
}

export type CallLogsWriteResult =
  | { ok: true; id: string; lead_id: string | null }
  | { ok: false; duplicate: { duplicate_lead_id: string | null; duplicate_reason: string } }
  | { ok: false; notFound: true };

export async function createCallLogsLead(
  ctx: CallLogsLeadContext,
  payload: Record<string, unknown>
): Promise<CallLogsWriteResult> {
  const { index } = await loadDuplicateIndex(ctx.db, ctx.campaignId, ctx.agentId);
  const dup = index.find(payload);
  if (dup) {
    return { ok: false, duplicate: { duplicate_lead_id: dup.lead_id, duplicate_reason: dup.reason } };
  }
  const nextLeadId = await createLeadIdGenerator(ctx.db, ctx.agentCode);
  const { data, error } = await ctx.db
    .from("leads")
    .insert({
      ...pickLeadColumns(payload),
      lead_id: nextLeadId(),
      organization_id: ctx.orgId,
      campaign_id: ctx.campaignId,
      assigned_agent_id: ctx.agentId,
      created_by: ctx.agentId,
    })
    .select("id, lead_id")
    .single();
  if (error) throw error;
  return { ok: true, id: data.id, lead_id: data.lead_id };
}

export async function updateCallLogsLead(
  ctx: CallLogsLeadContext,
  leadRowId: string,
  updates: Record<string, unknown>
): Promise<CallLogsWriteResult> {
  const { index, leads } = await loadDuplicateIndex(ctx.db, ctx.campaignId, ctx.agentId);
  const existing = leads.find((l) => l.id === leadRowId);
  if (!existing) return { ok: false, notFound: true };

  const dup = index.find({ ...existing, ...updates }, leadRowId);
  if (dup) {
    return { ok: false, duplicate: { duplicate_lead_id: dup.lead_id, duplicate_reason: dup.reason } };
  }

  const clean = pickLeadColumns(updates);
  for (const key of ["id", "lead_id", "organization_id", "campaign_id", "assigned_agent_id", "created_by"]) {
    delete clean[key];
  }
  const { data, error } = await ctx.db
    .from("leads")
    .update(clean)
    .eq("id", leadRowId)
    .eq("campaign_id", ctx.campaignId)
    .eq("assigned_agent_id", ctx.agentId)
    .select("id, lead_id")
    .single();
  if (error) throw error;
  return { ok: true, id: data.id, lead_id: data.lead_id };
}

/** Same response shape as main agent_import_campaign_leads(). */
export async function importCallLogsLeads(
  ctx: CallLogsLeadContext,
  rows: Record<string, unknown>[]
) {
  const { index, leads } = await loadDuplicateIndex(ctx.db, ctx.campaignId, ctx.agentId);
  const byId = new Map(leads.map((l) => [l.id, l]));
  const byLeadId = new Map(leads.filter((l) => l.lead_id).map((l) => [l.lead_id as string, l]));
  const nextLeadId = await createLeadIdGenerator(ctx.db, ctx.agentCode);

  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  const duplicateRows: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 1;
    const row = rows[i];
    const rowId = String(row.id ?? "").trim();
    const rowLeadId = String(row.lead_id ?? "").trim();

    let existing: ExistingLead | undefined;
    if (rowId) {
      existing = byId.get(rowId);
      if (!existing) {
        errors.push(`Row ${rowNo}: Lead not found or not assigned to you`);
        continue;
      }
    } else if (rowLeadId) {
      existing = byLeadId.get(rowLeadId);
      if (!existing) {
        errors.push(
          `Row ${rowNo}: Lead not found (${rowLeadId}). Export leads first and keep the lead_id column when editing.`
        );
        continue;
      }
    }

    const candidate = { ...(existing ?? {}), ...row };
    const name =
      [candidate.first_name, candidate.last_name].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ") ||
      String((candidate as { name?: unknown }).name ?? "").trim() ||
      null;

    if (
      !existing &&
      !name &&
      !String(row.company_name ?? "").trim() &&
      !String(row.email ?? "").trim() &&
      !String(row.phone ?? "").trim()
    ) {
      errors.push(`Row ${rowNo}: At least one of name, company, email, or phone is required`);
      continue;
    }

    const dup = index.find(candidate, existing?.id ?? null);
    if (dup) {
      duplicateRows.push({
        row: rowNo,
        lead_name: name,
        existing_lead_id: dup.lead_id,
        reason: dup.reason,
        source: "campaign",
      });
      errors.push(`Row ${rowNo}: Duplicate lead (${dup.lead_id}) by ${dup.reason} found in campaign.`);
      continue;
    }

    const fields = pickLeadColumns({ ...row, name });
    for (const key of ["id", "lead_id", "organization_id", "campaign_id", "assigned_agent_id", "created_by"]) {
      delete fields[key];
    }

    try {
      if (existing) {
        const { data, error } = await ctx.db
          .from("leads")
          .update(fields)
          .eq("id", existing.id)
          .eq("assigned_agent_id", ctx.agentId)
          .select(DUPLICATE_SELECT)
          .single();
        if (error) throw error;
        index.remove(existing.id);
        index.add(data as ExistingLead);
        updated++;
      } else {
        const { data, error } = await ctx.db
          .from("leads")
          .insert({
            ...fields,
            lead_id: nextLeadId(),
            organization_id: ctx.orgId,
            campaign_id: ctx.campaignId,
            assigned_agent_id: ctx.agentId,
            created_by: ctx.agentId,
          })
          .select(DUPLICATE_SELECT)
          .single();
        if (error) throw error;
        index.add(data as ExistingLead);
        created++;
      }
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Failed to save lead";
      errors.push(`Row ${rowNo}: ${msg}`);
    }
  }

  return {
    created,
    updated,
    total: rows.length,
    duplicates: duplicateRows.length,
    duplicate_rows: duplicateRows,
    errors,
  };
}

/** Lead row owned by this agent in the Call Logs DB (for drawer asset routes). */
export async function findCallLogsLeadForAgent(db: SupabaseClient, leadRowId: string, agentId: string) {
  const { data } = await db
    .from("leads")
    .select("id, campaign_id, organization_id")
    .eq("id", leadRowId)
    .eq("assigned_agent_id", agentId)
    .maybeSingle();
  return (data as { id: string; campaign_id: string; organization_id: string } | null) ?? null;
}
