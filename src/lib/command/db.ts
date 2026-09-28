/**
 * Typed DB helpers for Command Center tables.
 * Uses explicit `as` casts because Supabase v2.97 type inference
 * resolves new tables to `never` until types are regenerated.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  CommandProfile,
  CommandRoleRow,
  CommandAlertRow,
  CommandLeadHistoryRow,
} from "./types";

type Client = SupabaseClient<Database>;
type DbAny = (supabase: Client) => ReturnType<Client["from"]>;
const db = ((supabase: Client) => supabase) as DbAny;

// ─── Cursor-based pagination ──────────────────────────────────────────────────

export interface CursorPage {
  limit: number;
  cursor?: string | null; // opaque base64 token
}

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Encode {id, created_at} → opaque base64 cursor token */
export function encodeCursor(id: string, createdAt: string): string {
  return Buffer.from(JSON.stringify({ id, created_at: createdAt })).toString("base64url");
}

/** Decode cursor token → {id, created_at}. Returns null on parse failure. */
export function decodeCursor(
  token: string
): { id: string; created_at: string } | null {
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      id: string;
      created_at: string;
    };
  } catch {
    return null;
  }
}

/** Clamp a limit to [1, 100], defaulting to 25. */
export function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "25"), 10);
  if (isNaN(n)) return 25;
  return Math.max(1, Math.min(100, n));
}

// ─── User helpers ─────────────────────────────────────────────────────────────

export async function getProfile(
  supabase: Client,
  userId: string
): Promise<(CommandProfile & { client_id: string | null }) | null> {
  const { data } = (await db(supabase)
    .from("users")
    .select("organization_id, client_id")
    .eq("id", userId)
    .single()) as { data: (CommandProfile & { client_id: string | null }) | null };
  return data;
}

export async function getRoleNames(
  supabase: Client,
  userId: string
): Promise<string[]> {
  const { data } = (await db(supabase)
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId)) as { data: CommandRoleRow[] | null };
  return (data ?? [])
    .flatMap((r) => (r.roles?.name ? [r.roles.name] : []))
    .map((name) => name.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter((name) => name.length > 0);
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

/** `unresolved` = open + acknowledged (not yet resolved). */
export type AlertListStatusFilter =
  | "all"
  | "unresolved"
  | "open"
  | "acknowledged"
  | "resolved";

export interface AlertQueryOptions {
  organizationId: string;
  campaignId?: string | null;
  allowedCampaignIds?: string[] | null;
  severity?: string | null;
  /** @deprecated Pass `listStatus` from API layer instead */
  resolved?: boolean | null;
  listStatus?: AlertListStatusFilter;
  limit?: number;
  cursor?: string | null;
}

const COMMAND_ALERT_LIST_SELECT = `id, display_id, alert_type, severity, title, message, is_resolved,
  resolved_at, resolution_note, resolution_category, acknowledged_at,
  campaign_id, lead_id, created_at,
  campaigns(name),
  resolved_by_user:users!alerts_resolved_by_fkey(full_name, email),
  acknowledged_by_user:users!alerts_acknowledged_by_fkey(full_name, email)`;

export async function queryAlerts(
  supabase: Client,
  opts: AlertQueryOptions
): Promise<PageResult<CommandAlertRow>> {
  const limit = clampLimit(opts.limit ?? 25);

  let q = db(supabase)
    .from("alerts")
    .select(COMMAND_ALERT_LIST_SELECT)
    .eq("organization_id", opts.organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1); // fetch one extra to check hasMore

  if (opts.campaignId) q = q.eq("campaign_id", opts.campaignId);
  if (opts.allowedCampaignIds && opts.allowedCampaignIds.length > 0) {
    q = q.in("campaign_id", opts.allowedCampaignIds);
  }
  if (opts.allowedCampaignIds && opts.allowedCampaignIds.length === 0) {
    return { items: [], nextCursor: null, hasMore: false };
  }
  if (opts.severity) q = q.eq("severity", opts.severity);

  const listStatus: AlertListStatusFilter =
    opts.listStatus ??
    (opts.resolved === true ? "resolved" : opts.resolved === false ? "unresolved" : "all");

  if (listStatus === "resolved") {
    q = q.eq("is_resolved", true);
  } else if (listStatus === "unresolved") {
    q = q.eq("is_resolved", false);
  } else if (listStatus === "open") {
    q = q.eq("is_resolved", false).is("acknowledged_at", null);
  } else if (listStatus === "acknowledged") {
    q = q.eq("is_resolved", false).not("acknowledged_at", "is", null);
  }

  if (opts.cursor) {
    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      q = q.or(
        `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`
      );
    }
  }

  const { data, error } = (await q) as {
    data: CommandAlertRow[] | null;
    error: { message: string } | null;
  };

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor(last.id, last.created_at)
      : null;

  return { items, nextCursor, hasMore };
}

export async function getAllowedCampaignIdsForClientViewer(
  supabase: Client,
  organizationId: string,
  clientId: string | null
): Promise<string[]> {
  if (!clientId) return [];
  const { data, error } = (await db(supabase)
    .from("campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)) as { data: { id: string }[] | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id);
}

const RESOLUTION_CATEGORIES = new Set([
  "false_positive",
  "corrective_action",
  "escalated",
  "acknowledged_outcome",
]);

export async function resolveAlert(
  supabase: Client,
  alertId: string,
  userId: string,
  resolutionNote: string,
  resolutionCategory: string
): Promise<CommandAlertRow | null> {
  const note = resolutionNote.trim();
  if (note.length < 20) {
    throw new Error("Resolution notes must be at least 20 characters");
  }
  if (!RESOLUTION_CATEGORIES.has(resolutionCategory)) {
    throw new Error("Invalid resolution category");
  }

  const { data: existing, error: fetchErr } = (await db(supabase)
    .from("alerts")
    .select("lead_id, is_resolved")
    .eq("id", alertId)
    .single()) as {
    data: { lead_id: string | null; is_resolved: boolean } | null;
    error: { message: string } | null;
  };

  if (fetchErr || !existing) throw new Error(fetchErr?.message ?? "Alert not found");
  if (existing.is_resolved) throw new Error("Alert is already resolved");

  const resolvedAt = new Date().toISOString();

  const { data: updated, error: updErr } = (await db(supabase)
    .from("alerts")
    .update({
      is_resolved: true,
      resolved_by: userId,
      resolved_at: resolvedAt,
      resolution_note: note,
      resolution_category: resolutionCategory,
    })
    .eq("id", alertId)
    .select(COMMAND_ALERT_LIST_SELECT)
    .single()) as { data: CommandAlertRow | null; error: { message: string } | null };

  if (updErr) throw new Error(updErr.message);

  if (existing.lead_id && updated) {
    const disp = updated.display_id ?? "?";
    const rc = note.trim().slice(0, 255);
    const { error: histErr } = await db(supabase).from("lead_history").insert({
      lead_id: existing.lead_id,
      changed_by: userId,
      change_type: "alert_resolved",
      old_value: { alert_id: alertId },
      new_value: {
        display_id: updated.display_id,
        resolution_category: resolutionCategory,
        resolution_note: note.slice(0, 2000),
      },
      reason: `Alert #${disp} resolved [${resolutionCategory}]: ${note.slice(0, 400)}`,
      trigger_source: "manual",
      reason_code: rc,
      metadata: {
        alert_id: alertId,
        resolution_category: resolutionCategory,
      },
    } as never);

    if (histErr) {
      await db(supabase)
        .from("alerts")
        .update({
          is_resolved: false,
          resolved_by: null,
          resolved_at: null,
          resolution_note: null,
          resolution_category: null,
        })
        .eq("id", alertId);
      throw new Error(
        `Could not write audit log: ${histErr.message}. Alert was not marked resolved.`
      );
    }
  }

  return updated;
}

export async function acknowledgeAlert(
  supabase: Client,
  alertId: string,
  userId: string
): Promise<CommandAlertRow | null> {
  const { data: existing, error: fetchErr } = (await db(supabase)
    .from("alerts")
    .select("is_resolved, acknowledged_at")
    .eq("id", alertId)
    .single()) as {
    data: { is_resolved: boolean; acknowledged_at: string | null } | null;
    error: { message: string } | null;
  };

  if (fetchErr || !existing) throw new Error(fetchErr?.message ?? "Alert not found");
  if (existing.is_resolved) throw new Error("Cannot acknowledge a resolved alert");
  if (existing.acknowledged_at) throw new Error("Alert is already acknowledged");

  const { data, error } = (await db(supabase)
    .from("alerts")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: userId,
    })
    .eq("id", alertId)
    .select(COMMAND_ALERT_LIST_SELECT)
    .single()) as { data: CommandAlertRow | null; error: { message: string } | null };

  if (error) throw new Error(error.message);
  return data;
}

// ─── Lead History ──────────────────────────────────────────────────────────────

export async function queryLeadHistory(
  supabase: Client,
  leadId: string,
  opts?: CursorPage
): Promise<PageResult<CommandLeadHistoryRow>> {
  const limit = clampLimit(opts?.limit ?? 50);

  let q = db(supabase)
    .from("lead_history")
    .select(
      "id, change_type, old_value, new_value, reason, ip_address, created_at, changed_by, previous_status, new_status, trigger_source, reason_code, metadata"
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (opts?.cursor) {
    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      q = q.or(
        `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`
      );
    }
  }

  const { data, error } = (await q) as {
    data: CommandLeadHistoryRow[] | null;
    error: { message: string } | null;
  };

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor(last.id, last.created_at)
      : null;

  return { items, nextCursor, hasMore };
}

// ─── Campaign metrics upsert ──────────────────────────────────────────────────

export async function upsertCampaignMetrics(
  supabase: Client,
  campaignId: string,
  metrics: Record<string, unknown>
): Promise<void> {
  const { data: existing } = (await db(supabase)
    .from("campaign_metrics")
    .select("id")
    .eq("campaign_id", campaignId)
    .single()) as { data: { id: string } | null };

  if (existing) {
    await db(supabase)
      .from("campaign_metrics")
      .update({ ...metrics, updated_at: new Date().toISOString() })
      .eq("campaign_id", campaignId);
  } else {
    await db(supabase)
      .from("campaign_metrics")
      .insert({ campaign_id: campaignId, ...metrics });
  }
}

export async function appendCampaignMetricsHistory(
  supabase: Client,
  campaignId: string,
  payload: {
    date?: string;
    total_leads_delivered?: number | null;
    channel_split?: Record<string, unknown> | null;
    deficit_leads?: number | null;
    lead_increment?: number | null;
    lead_replace?: number | null;
    total_campaign_spend?: number | null;
    updated_by?: string | null;
  }
): Promise<void> {
  const { error } = (await db(supabase)
    .from("campaign_metrics_history")
    .insert({
      campaign_id: campaignId,
      date: payload.date ?? new Date().toISOString().slice(0, 10),
      total_leads_delivered: payload.total_leads_delivered ?? 0,
      channel_split: payload.channel_split ?? {},
      deficit_leads: payload.deficit_leads ?? 0,
      lead_increment: payload.lead_increment ?? 0,
      lead_replace: payload.lead_replace ?? 0,
      total_campaign_spend: payload.total_campaign_spend ?? 0,
      updated_by: payload.updated_by ?? null,
    })) as { error: { message: string } | null };
  if (error) throw new Error(error.message);
}

export interface CampaignMetricsHistoryItem {
  id: string;
  date: string;
  total_leads_delivered: number | null;
  channel_split: Record<string, unknown> | null;
  deficit_leads: number | null;
  lead_increment: number | null;
  lead_replace: number | null;
  total_campaign_spend: number | null;
  updated_by: string | null;
  created_at: string;
  updated_by_user?: { id: string; full_name: string | null; email: string | null } | null;
}

export async function queryCampaignMetricsHistory(
  supabase: Client,
  campaignId: string,
  limit = 120
): Promise<CampaignMetricsHistoryItem[]> {
  const safeLimit = Math.max(1, Math.min(365, limit));
  const { data, error } = (await db(supabase)
    .from("campaign_metrics_history")
    .select("id, date, total_leads_delivered, channel_split, deficit_leads, lead_increment, lead_replace, total_campaign_spend, updated_by, created_at, users:updated_by(id, full_name, email)")
    .eq("campaign_id", campaignId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(safeLimit)) as {
    data: Array<{
      id: string;
      date: string;
      total_leads_delivered: number | null;
      channel_split: Record<string, unknown> | null;
      deficit_leads: number | null;
      lead_increment: number | null;
      lead_replace: number | null;
      total_campaign_spend: number | null;
      updated_by: string | null;
      created_at: string;
      users: { id: string; full_name: string | null; email: string | null } | null;
    }> | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    total_leads_delivered: r.total_leads_delivered,
    channel_split: r.channel_split,
    deficit_leads: r.deficit_leads,
    lead_increment: r.lead_increment,
    lead_replace: r.lead_replace,
    total_campaign_spend: r.total_campaign_spend,
    updated_by: r.updated_by,
    created_at: r.created_at,
    updated_by_user: r.users ?? null,
  }));
}

// ─── Campaign analytics ───────────────────────────────────────────────────────

interface CampaignMetricsRow {
  sponsor_name: string | null;
  total_leads_allocated: number | null;
  total_campaign_spend: number | null;
  total_leads_delivered: number | null;
  deficit_leads: number | null;
  channel_split: unknown;
  total_leads: number | null;
  qa_pending_count: number | null;
  qualified_count: number | null;
  registered_count: number | null;
  attended_count: number | null;
  disqualified_count: number | null;
  no_show_count: number | null;
}

interface LeadAnalyticsRow {
  id: string;
  status: string;
  consent_status: string | null;
  channel: string | null;
  delivery_status: string | null;
  created_at: string;
  delivered_at: string | null;
}

interface AlertAnalyticsRow {
  id: string;
  alert_type: string;
  severity: string;
  is_resolved: boolean;
  created_at: string;
}

interface HistoryAnalyticsRow {
  id: string;
  change_type: string;
  created_at: string;
}

export async function getCampaignAnalytics(supabase: Client, campaignId: string) {
  const metricsResult = (await db(supabase)
    .from("campaign_metrics")
    .select("*")
    .eq("campaign_id", campaignId)
    .single()) as { data: CampaignMetricsRow | null };

  const leadsResult = (await supabase
    .from("leads")
    .select("id, status, consent_status, channel, delivery_status, created_at, delivered_at")
    .eq("campaign_id", campaignId)) as unknown as {
    data: LeadAnalyticsRow[] | null;
  };

  const leads = leadsResult.data ?? [];
  const leadIds = leads.map((l) => l.id);

  const histResult =
    leadIds.length > 0
      ? ((await db(supabase)
          .from("lead_history")
          .select("id, change_type, created_at")
          .in("lead_id", leadIds)
          .order("created_at", { ascending: false })
          .limit(100)) as { data: HistoryAnalyticsRow[] | null })
      : { data: [] as HistoryAnalyticsRow[] };

  const alertResult = (await db(supabase)
    .from("alerts")
    .select("id, alert_type, severity, is_resolved, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(50)) as { data: AlertAnalyticsRow[] | null };

  return {
    metrics: metricsResult.data,
    leads,
    history: histResult.data ?? [],
    alerts: alertResult.data ?? [],
  };
}

/** Per-campaign lead aggregates for Command Center list (organization-scoped). */
export interface CommandListLeadAgg {
  total: number;
  qualified: number;
  /** MIS-delivered leads (`delivery_status = 'delivered'`). */
  delivered: number;
  /** Leads that cleared QA (qualified → funnel): qualified, registered, attended, no_show */
  qa_verified: number;
  dq: number;
  missingConsent: number;
  disputedConsent: number;
  pendingConsent: number;
  verified: number;
}

export async function aggregateCommandLeadStatsByCampaign(
  supabase: Client,
  organizationId: string,
  campaignIds: string[]
): Promise<Record<string, CommandListLeadAgg>> {
  const postQaVerified = new Set(["qualified", "registered", "attended", "no_show"]);
  /** PostgREST caps a single response at 1000 rows — must page for multi-campaign lists. */
  const PAGE = 1000;

  const empty = (): CommandListLeadAgg => ({
    total: 0,
    qualified: 0,
    delivered: 0,
    qa_verified: 0,
    dq: 0,
    missingConsent: 0,
    disputedConsent: 0,
    pendingConsent: 0,
    verified: 0,
  });
  if (campaignIds.length === 0) return {};
  const out: Record<string, CommandListLeadAgg> = {};
  for (const id of campaignIds) out[id] = empty();

  type LeadAggRow = {
    campaign_id: string;
    status: string;
    qa_status: string | null;
    consent_status: string | null;
    delivery_status: string | null;
  };

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select("campaign_id, status, qa_status, consent_status, delivery_status")
      .eq("organization_id", organizationId)
      .in("campaign_id", campaignIds)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as LeadAggRow[];
    for (const row of rows) {
      const b = out[row.campaign_id];
      if (!b) continue;
      b.total += 1;
      const st = String(row.status ?? "").toLowerCase().trim();
      const qa = String(row.qa_status ?? "").toLowerCase().trim();
      const qaOrStatus = qa || st;
      if (String(row.delivery_status ?? "").trim().toLowerCase() === "delivered") {
        b.delivered += 1;
      }
      // Keep campaign list qualified% consistent with dashboard analytics:
      // treat post-QA leads (qualified/registered/attended/no_show) as qualified-like.
      if (postQaVerified.has(qaOrStatus) || postQaVerified.has(st)) b.qualified += 1;
      if (postQaVerified.has(qaOrStatus) || postQaVerified.has(st)) b.qa_verified += 1;
      if (qaOrStatus === "disqualified" || st === "disqualified") b.dq += 1;
      const cs = String(row.consent_status ?? "pending").toLowerCase();
      if (cs === "missing") b.missingConsent += 1;
      else if (cs === "disputed") b.disputedConsent += 1;
      else if (cs === "pending") b.pendingConsent += 1;
      else if (cs === "verified") b.verified += 1;
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

export interface CommandListAlertAgg {
  count: number;
  hasRed: boolean;
  hasYellow: boolean;
}

export async function aggregateUnresolvedAlertsByCampaign(
  supabase: Client,
  organizationId: string,
  campaignIds: string[]
): Promise<Record<string, CommandListAlertAgg>> {
  if (campaignIds.length === 0) return {};
  const { data, error } = await supabase
    .from("alerts")
    .select("campaign_id, severity")
    .eq("organization_id", organizationId)
    .eq("is_resolved", false)
    .in("campaign_id", campaignIds);
  if (error) throw new Error(error.message);
  const out: Record<string, CommandListAlertAgg> = {};
  for (const id of campaignIds) {
    out[id] = { count: 0, hasRed: false, hasYellow: false };
  }
  for (const row of (data ?? []) as {
    campaign_id: string | null;
    severity: string;
  }[]) {
    const cid = row.campaign_id;
    if (!cid || !out[cid]) continue;
    const b = out[cid];
    b.count += 1;
    if (row.severity === "critical" || row.severity === "high") b.hasRed = true;
    if (row.severity === "medium" || row.severity === "low") b.hasYellow = true;
  }
  return out;
}

/** Count of dq_override alerts per campaign (admin DQ override audit events). */
export async function aggregateDqOverrideAlertCountsByCampaign(
  supabase: Client,
  organizationId: string,
  campaignIds: string[]
): Promise<Record<string, number>> {
  if (campaignIds.length === 0) return {};
  const { data, error } = await supabase
    .from("alerts")
    .select("campaign_id")
    .eq("organization_id", organizationId)
    .eq("alert_type", "dq_override")
    .in("campaign_id", campaignIds);
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const id of campaignIds) out[id] = 0;
  for (const row of (data ?? []) as { campaign_id: string | null }[]) {
    const cid = row.campaign_id;
    if (cid && cid in out) out[cid] += 1;
  }
  return out;
}

export type CommandCampaignScopeFilters = {
  organizationId: string;
  clientId?: string | null;
  campaignIds?: string[] | null;
  qRaw?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type CommandCampaignStatusSummary = {
  total: number;
  active: number;
  completed: number;
  paused: number;
  draft: number;
};

/** Status breakdown for campaign list stat cards (search/date scope, not table status filter). */
export async function aggregateCommandCampaignStatusSummary(
  supabase: Client,
  filters: CommandCampaignScopeFilters
): Promise<CommandCampaignStatusSummary> {
  type CampaignCountQuery = ReturnType<ReturnType<Client["from"]>["select"]>;

  const applyScope = (q: CampaignCountQuery): CampaignCountQuery => {
    let x = q.eq("organization_id", filters.organizationId);
    if (filters.campaignIds && filters.campaignIds.length > 0) {
      x = x.in("id", filters.campaignIds);
    } else if (filters.clientId) {
      x = x.eq("client_id", filters.clientId);
    }
    const qRaw = filters.qRaw?.trim() ?? "";
    if (qRaw.length > 0) {
      const safe = qRaw.replace(/%/g, "").replace(/_/g, "");
      if (safe.length > 0) x = x.ilike("name", `%${safe}%`);
    }
    const dateFrom = filters.dateFrom?.trim() ?? "";
    const dateTo = filters.dateTo?.trim() ?? "";
    if (dateFrom && dateTo) {
      x = x
        .or(`start_date.is.null,start_date.lte.${dateTo}`)
        .or(`end_date.is.null,end_date.gte.${dateFrom}`);
    } else if (dateFrom) {
      x = x.or(`end_date.is.null,end_date.gte.${dateFrom}`);
    } else if (dateTo) {
      x = x.or(`start_date.is.null,start_date.lte.${dateTo}`);
    }
    return x;
  };

  const countScoped = async (status?: string) => {
    let q = applyScope(
      supabase.from("campaigns").select("id", { count: "exact", head: true })
    );
    if (status) q = q.eq("status", status);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [total, active, completed, paused, draft] = await Promise.all([
    countScoped(),
    countScoped("active"),
    countScoped("completed"),
    countScoped("paused"),
    countScoped("draft"),
  ]);

  return { total, active, completed, paused, draft };
}
