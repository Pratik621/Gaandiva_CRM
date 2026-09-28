/**
 * Campaign Command Center — Rules Engine
 * Internal use only. Never expose via public API.
 *
 * All lead status changes flow through this engine before any DB write.
 * The critical path (update lead + history + metrics + alert) is delegated
 * to the `cmd_process_lead_status_change` PostgreSQL RPC which executes
 * atomically inside a single transaction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { normalizeRoleNames } from "@/lib/auth/config";
import { validateTransition } from "./state-machine";

export type RulesEngineClient = SupabaseClient<Database>;

// Minimal row types used in casts
type LeadMinRow = {
  id: string;
  status: string;
  consent_status: string | null;
  risk_flags: unknown;
  campaign_id: string;
};
type ConsentMinRow = {
  ip_address: string | null;
  recording_url: string | null;
  consent_given_at: string | null;
};

// Helper to escape Supabase's `never`-typed table names for new tables
type AnyCast = (s: RulesEngineClient) => ReturnType<RulesEngineClient["from"]>;
const asAny = ((s: RulesEngineClient) => s) as AnyCast;

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface RulesEngineContext {
  supabase: RulesEngineClient;
  userId: string;
  userRoles: string[];
  leadId: string;
  campaignId?: string;
  organizationId: string;
  ipAddress?: string;
}

export interface RulesEngineResult {
  allowed: boolean;
  reason?: string;
  code?: RulesEngineCode;
  alertsCreated?: string[];
  alertDeduped?: boolean;
}

export type RulesEngineCode =
  | "ROLE_FORBIDDEN"
  | "INVALID_TRANSITION"
  | "LEAD_NOT_QUALIFIED"
  | "CONSENT_NOT_VERIFIED"
  | "LEAD_DISQUALIFIED"
  | "DQ_OVERRIDE_FORBIDDEN"
  | "DQ_OVERRIDE_REASON_REQUIRED"
  | "CONSENT_MISSING_IP"
  | "CONSENT_MISSING_RECORDING"
  | "OK";

export interface StatusChangePayload {
  newStatus: string;
  reason?: string;
  /** Admin-only: bypass state machine for disqualified leads */
  dqOverride?: boolean;
}

export interface ConsentValidationResult {
  valid: boolean;
  issues: string[];
  resolvedStatus: "pending" | "verified" | "missing" | "disputed";
}

import { normalizeRoleName } from "@/lib/auth/config";

// ─── Role Helpers ─────────────────────────────────────────────────────────────

const COMMAND_ROLES = ["internal_operator", "internal_admin", "admin"] as const;
const ADMIN_OVERRIDE_ROLES = ["internal_admin", "admin"] as const;

export function hasCommandRole(roles: string[]): boolean {
  const normalized = normalizeRoleNames(roles);
  return normalized.some((r) =>
    (COMMAND_ROLES as readonly string[]).includes(r)
  );
}

export function hasAdminOverrideRole(roles: string[]): boolean {
  const normalized = normalizeRoleNames(roles);
  return normalized.some((r) =>
    (ADMIN_OVERRIDE_ROLES as readonly string[]).includes(r)
  );
}

// ─── Consent Validation ───────────────────────────────────────────────────────

export async function validateConsent(
  ctx: RulesEngineContext
): Promise<ConsentValidationResult> {
  const { supabase, leadId } = ctx;

  const { data: records } = (await asAny(supabase)
    .from("consent_records")
    .select("ip_address, recording_url, consent_given_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)) as { data: ConsentMinRow[] | null };

  const issues: string[] = [];

  if (!records || records.length === 0) {
    return { valid: false, issues: ["No consent record found"], resolvedStatus: "missing" };
  }

  const record = records[0];
  if (!record.ip_address) issues.push("Missing IP address in consent record");
  if (!record.recording_url) issues.push("Missing recording URL in consent record");
  if (!record.consent_given_at) issues.push("Missing consent timestamp");

  return {
    valid: issues.length === 0,
    issues,
    resolvedStatus: issues.length === 0 ? "verified" : "missing",
  };
}

// ─── Alert Creator (TypeScript-side dedup for non-RPC paths) ─────────────────

export async function createAlert(
  supabase: RulesEngineClient,
  payload: {
    organizationId: string;
    campaignId?: string;
    leadId?: string;
    alertType: string;
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    message?: string;
    metadata?: Record<string, unknown>;
    createdBy?: string;
  }
): Promise<{ id: string | null; deduped: boolean }> {
  // Dedup check: skip if an open alert with same type + lead already exists
  if (payload.leadId) {
    const { data: existing } = (await asAny(supabase)
      .from("alerts")
      .select("id")
      .eq("alert_type", payload.alertType)
      .eq("lead_id", payload.leadId)
      .eq("is_resolved", false)
      .limit(1)
      .single()) as { data: { id: string } | null };

    if (existing) return { id: existing.id, deduped: true };
  }

  const { data, error } = (await asAny(supabase)
    .from("alerts")
    .insert({
      organization_id: payload.organizationId,
      campaign_id: payload.campaignId ?? null,
      lead_id: payload.leadId ?? null,
      alert_type: payload.alertType,
      severity: payload.severity,
      title: payload.title,
      message: payload.message ?? null,
      metadata: payload.metadata ?? {},
      created_by: payload.createdBy ?? null,
    })
    .select("id")
    .single()) as { data: { id: string } | null; error: { message: string } | null };

  if (error) {
    console.error("[rules-engine] createAlert error:", error.message);
    return { id: null, deduped: false };
  }

  return { id: data?.id ?? null, deduped: false };
}

// ─── Append Lead History (standalone, for non-RPC paths) ─────────────────────

export async function appendLeadHistory(
  supabase: RulesEngineClient,
  payload: {
    leadId: string;
    changedBy: string;
    changeType: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    reason?: string;
    ipAddress?: string;
    triggerSource?: "system" | "manual";
    reasonCode?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const triggerSource = payload.triggerSource ?? "system";
  const prev =
    payload.oldValue && typeof payload.oldValue.status === "string"
      ? payload.oldValue.status
      : null;
  const next =
    payload.newValue && typeof payload.newValue.status === "string"
      ? payload.newValue.status
      : null;
  const rc =
    payload.reasonCode ??
    (payload.reason && payload.reason.trim()
      ? payload.reason.trim().slice(0, 255)
      : null);

  const { error } = (await asAny(supabase)
    .from("lead_history")
    .insert({
      lead_id: payload.leadId,
      changed_by: payload.changedBy,
      change_type: payload.changeType,
      old_value: payload.oldValue ?? null,
      new_value: payload.newValue ?? null,
      reason: payload.reason ?? null,
      ip_address: payload.ipAddress ?? null,
      previous_status: prev,
      new_status: next,
      trigger_source: triggerSource,
      reason_code: rc,
      metadata: payload.metadata ?? {},
    })) as { error: { message: string } | null };

  if (error) console.error("[rules-engine] appendLeadHistory error:", error.message);
}

// ─── Main Entry: processLeadStatusChange ─────────────────────────────────────

export async function processLeadStatusChange(
  ctx: RulesEngineContext,
  payload: StatusChangePayload
): Promise<RulesEngineResult> {
  const { supabase, userId, organizationId, leadId, ipAddress } = ctx;
  const { newStatus, reason, dqOverride } = payload;

  // ── 1. Role guard ────────────────────────────────────────────
  if (!hasCommandRole(ctx.userRoles)) {
    return { allowed: false, code: "ROLE_FORBIDDEN", reason: "Insufficient permissions." };
  }

  // ── 2. Fetch current lead ────────────────────────────────────
  const { data: lead, error: fetchErr } = (await asAny(supabase)
    .from("leads")
    .select("id, status, consent_status, campaign_id, risk_flags")
    .eq("id", leadId)
    .single()) as { data: LeadMinRow | null; error: { message: string } | null };

  if (fetchErr || !lead) {
    return { allowed: false, code: "LEAD_NOT_QUALIFIED", reason: "Lead not found." };
  }

  const campaignId = ctx.campaignId ?? lead.campaign_id;

  // ── 3a. DQ Override path (admin only, bypasses state machine) ─
  if (dqOverride) {
    if (!hasAdminOverrideRole(ctx.userRoles)) {
      return {
        allowed: false,
        code: "DQ_OVERRIDE_FORBIDDEN",
        reason: "DQ override requires internal_admin role.",
      };
    }
    if (!reason || reason.trim().length < 5) {
      return {
        allowed: false,
        code: "DQ_OVERRIDE_REASON_REQUIRED",
        reason: "A reason (≥5 chars) is required for DQ override.",
      };
    }

    // Execute atomically via RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "cmd_process_lead_status_change" as never,
      {
        p_lead_id:        leadId,
        p_new_status:     newStatus,
        p_new_consent:    lead.consent_status ?? "pending",
        p_changed_by:     userId,
        p_reason:         reason,
        p_old_status:     lead.status,
        p_old_consent:    lead.consent_status ?? "pending",
        p_ip_address:     ipAddress ?? null,
        p_alert_type:     "dq_override",
        p_alert_title:    "DQ Override Applied",
        p_alert_message:  `Lead ${leadId} overridden by admin. Reason: ${reason}`,
        p_alert_severity: "high",
        p_alert_metadata: { leadId, previousStatus: lead.status, newStatus, reason },
      } as never
    ) as { data: { alert_id: string | null; deduped: boolean } | null; error: { message: string } | null };

    if (rpcErr) {
      return { allowed: false, code: "ROLE_FORBIDDEN", reason: rpcErr.message };
    }

    return {
      allowed: true,
      code: "OK",
      alertsCreated: rpcData?.alert_id ? [rpcData.alert_id] : [],
      alertDeduped: rpcData?.deduped ?? false,
    };
  }

  // ── 3b. State machine validation ────────────────────────────
  const transition = validateTransition(lead.status, newStatus);
  if (!transition.allowed) {
    return { allowed: false, code: "INVALID_TRANSITION", reason: transition.reason };
  }

  // ── 4. Consent validation ────────────────────────────────────
  const { valid: consentValid, resolvedStatus: newConsentStatus } =
    await validateConsent(ctx);

  if (newStatus === "registered" && !consentValid) {
    return {
      allowed: false,
      code: "CONSENT_NOT_VERIFIED",
      reason: "Consent must be verified before registering a lead.",
    };
  }

  // Determine alert (if consent is missing, raise one)
  const alertType = newConsentStatus === "missing" ? "consent_missing" : null;
  const riskFlags = (lead.risk_flags as unknown[]) ?? [];

  // ── 5. Atomic RPC — update lead + history + metrics + optional alert ──
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "cmd_process_lead_status_change" as never,
    {
      p_lead_id:        leadId,
      p_new_status:     newStatus,
      p_new_consent:    newConsentStatus,
      p_changed_by:     userId,
      p_reason:         reason ?? null,
      p_old_status:     lead.status,
      p_old_consent:    lead.consent_status ?? "pending",
      p_ip_address:     ipAddress ?? null,
      p_alert_type:     alertType,
      p_alert_title:    alertType ? "Consent Missing" : null,
      p_alert_message:  alertType
        ? `Lead ${leadId} has missing consent after transition to '${newStatus}'.`
        : null,
      p_alert_severity: "medium",
      p_alert_metadata: alertType ? { leadId, newStatus } : {},
    } as never
  ) as { data: { alert_id: string | null; deduped: boolean } | null; error: { message: string } | null };

  if (rpcErr) {
    return { allowed: false, code: "ROLE_FORBIDDEN", reason: rpcErr.message };
  }

  const alertsCreated: string[] = [];
  if (rpcData?.alert_id) alertsCreated.push(rpcData.alert_id);

  // ── 6. Secondary alert for risk flags (TypeScript-side dedup) ──
  if (riskFlags.length > 0) {
    const { id: riskAlertId } = await createAlert(supabase, {
      organizationId,
      campaignId,
      leadId,
      alertType: "risk_flag",
      severity: "high",
      title: "Risk Flags Detected",
      message: `Lead ${leadId} has ${riskFlags.length} active risk flag(s).`,
      metadata: { leadId, riskFlags },
      createdBy: userId,
    });
    if (riskAlertId) alertsCreated.push(riskAlertId);
  }

  return {
    allowed: true,
    code: "OK",
    alertsCreated,
    alertDeduped: rpcData?.deduped ?? false,
  };
}
