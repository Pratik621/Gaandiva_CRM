import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import {
  LEAD_TAGGING_SCORED,
  looksLikeLeadTaggingCell,
  normalizeLeadTaggingValue,
} from "@/lib/lead-tagging";

dayjs.extend(customParseFormat);

/** Values treated as empty when re-importing exported/edited spreadsheets. */
const PLACEHOLDER_VALUES = new Set([
  "",
  "-",
  "—",
  "–",
  "_",
  ".",
  "n/a",
  "na",
  "nil",
  "null",
  "none",
  "undefined",
  "tbd",
  "tba",
]);

/** Never written from bulk import (system / join columns). */
export const LEAD_IMPORT_READONLY_FIELDS = new Set([
  "created_at",
  "updated_at",
  "ingested_at",
  "qualified_at",
  "assigned_agent_id",
  "assigned_agent_name",
  "created_by",
  "created_by_name",
  "creator_display_name",
  "campaign_id",
  "campaign_name",
  "organization_id",
  "delivered_by",
  "delivered_by_name",
  "delivery_agent_name",
  "team_leader_name",
  "manager_name",
  "agent_name",
  "risk_flags",
  "consent_status",
  "rep_id",
  "dq_reason_code",
  "qa_audited_by_id",
  "qa_audited_at",
]);

/** Only the QA role may set these via bulk import (agents/MIS/TL use other fields). */
export const QA_AUDIT_IMPORT_FIELD_KEYS = [
  "qa_status",
  "qa_comments",
  "qa_name",
  "audit_date",
  "disqualification_reasons",
  "disqualification_reason",
  "rectified_reason",
  "rectification_status",
  "rectification_qa_name",
  "rectification_date",
] as const;

export function stripQaAuditFieldsFromImport(
  fields: Record<string, unknown>
): void {
  for (const key of QA_AUDIT_IMPORT_FIELD_KEYS) {
    delete fields[key];
  }
}

/** Postgres `date` columns on leads. */
export const LEAD_IMPORT_DATE_FIELDS = new Set([
  "followup_date",
  "audit_date",
  "rectification_date",
]);

/** Postgres `timestamptz` columns on leads. */
export const LEAD_IMPORT_TIMESTAMP_FIELDS = new Set([
  "delivered_at",
  "appointment",
  "scored",
  "registered_at",
]);

/** Phone-like columns — Excel often stores these as numbers. */
export const LEAD_IMPORT_PHONE_FIELD_KEYS = new Set([
  "phone",
  "direct_number",
  "company_number",
]);

/**
 * Normalize a phone cell from CSV/Excel (string or numeric) for `leads.phone` text columns.
 */
export function normalizeImportPhoneField(value: unknown): string | null {
  if (isImportPlaceholder(value)) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  const s = String(value).trim();
  if (!s || isImportPlaceholder(s)) return null;

  if (/^[\d.]+e[+-]?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.trunc(n));
  }

  const cleaned = s.replace(/[^\d+\-().\s]/g, "").trim();
  return cleaned || null;
}

const DATE_PARSE_FORMATS = [
  "YYYY-MM-DD",
  "YYYY-MM-DDTHH:mm:ss.SSSZ",
  "YYYY-MM-DDTHH:mm:ssZ",
  "DD/MM/YYYY",
  "D/M/YYYY",
  "MM/DD/YYYY",
  "M/D/YYYY",
  "MMM D, YYYY",
  "MMM D, YYYY, h:mm A",
  "MMM D, YYYY h:mm A",
] as const;

export function isImportPlaceholder(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "number") {
    return Number.isNaN(value);
  }
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  return PLACEHOLDER_VALUES.has(trimmed) || PLACEHOLDER_VALUES.has(trimmed.toLowerCase());
}

/** Excel serial date (days since 1899-12-30). */
function excelSerialToDayjs(serial: number): dayjs.Dayjs | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const utcMs = Math.round((serial - 25569) * 86400 * 1000);
  const d = dayjs(utcMs);
  return d.isValid() ? d : null;
}

export function normalizeImportDateField(value: unknown): string | null {
  if (isImportPlaceholder(value)) return null;
  if (typeof value === "number") {
    const fromExcel = excelSerialToDayjs(value);
    return fromExcel ? fromExcel.format("YYYY-MM-DD") : null;
  }
  const s = String(value).trim();
  const strict = dayjs(s, [...DATE_PARSE_FORMATS], true);
  if (strict.isValid()) return strict.format("YYYY-MM-DD");
  const loose = dayjs(s);
  if (loose.isValid()) return loose.format("YYYY-MM-DD");
  return null;
}

export function normalizeImportTimestampField(value: unknown): string | null {
  if (isImportPlaceholder(value)) return null;
  if (typeof value === "number") {
    const fromExcel = excelSerialToDayjs(value);
    return fromExcel ? fromExcel.toISOString() : null;
  }
  const s = String(value).trim();
  const strict = dayjs(s, [...DATE_PARSE_FORMATS], true);
  if (strict.isValid()) return strict.toISOString();
  const loose = dayjs(s);
  if (loose.isValid()) return loose.toISOString();
  return null;
}

export function normalizeImportIntegerField(value: unknown): number | null {
  if (isImportPlaceholder(value)) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Normalize picked import fields: drop placeholders, coerce dates/timestamps, strip readonly keys.
 */
export function sanitizeLeadImportFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(fields)) {
    if (LEAD_IMPORT_READONLY_FIELDS.has(key)) continue;
    if (isImportPlaceholder(raw)) continue;

    if (LEAD_IMPORT_DATE_FIELDS.has(key)) {
      const parsed = normalizeImportDateField(raw);
      if (parsed) out[key] = parsed;
      continue;
    }

    if (LEAD_IMPORT_TIMESTAMP_FIELDS.has(key)) {
      const parsed = normalizeImportTimestampField(raw);
      if (parsed) out[key] = parsed;
      continue;
    }

    if (key === "founded_years") {
      const parsed = normalizeImportIntegerField(raw);
      if (parsed != null) out[key] = parsed;
      continue;
    }

    if (LEAD_IMPORT_PHONE_FIELD_KEYS.has(key)) {
      const parsed = normalizeImportPhoneField(raw);
      if (parsed) out[key] = parsed;
      continue;
    }

    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed || isImportPlaceholder(trimmed)) continue;
      out[key] = key === "lead_tagging" ? normalizeLeadTaggingValue(trimmed) ?? trimmed : trimmed;
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      out[key] = raw;
    }
  }

  return out;
}

export function pickAndSanitizeLeadImportFields(
  obj: Record<string, unknown>,
  allowed: readonly string[]
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const k of allowed) {
    if (LEAD_IMPORT_READONLY_FIELDS.has(k)) continue;
    const v = obj[k];
    if (v === undefined || v === null) continue;
    if (isImportPlaceholder(v)) continue;
    picked[k] = v;
  }
  return sanitizeLeadImportFields(picked);
}

/** Coerce a single spreadsheet cell before it is stored on the parsed row. */
export function coerceParsedImportCell(key: string, val: unknown): unknown | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "number" && !Number.isNaN(val)) {
    if (
      LEAD_IMPORT_DATE_FIELDS.has(key) ||
      LEAD_IMPORT_TIMESTAMP_FIELDS.has(key)
    ) {
      return val;
    }
    if (LEAD_IMPORT_PHONE_FIELD_KEYS.has(key)) {
      return normalizeImportPhoneField(val) ?? undefined;
    }
    return val;
  }
  const str = String(val).trim();
  if (!str || isImportPlaceholder(str)) return undefined;
  if (LEAD_IMPORT_READONLY_FIELDS.has(key)) return undefined;
  if (LEAD_IMPORT_DATE_FIELDS.has(key)) {
    return normalizeImportDateField(str) ?? undefined;
  }
  if (LEAD_IMPORT_TIMESTAMP_FIELDS.has(key)) {
    // Agents often put "Scored" in the scored-date column — keep raw so
    // finalizeImportedLeadRow can move it to lead_tagging instead of dropping it.
    if (looksLikeLeadTaggingCell(str)) return str;
    return normalizeImportTimestampField(str) ?? undefined;
  }
  if (LEAD_IMPORT_PHONE_FIELD_KEYS.has(key)) {
    return normalizeImportPhoneField(str) ?? undefined;
  }
  if (key === "lead_tagging") {
    return normalizeLeadTaggingValue(str) ?? str;
  }
  return str;
}

/**
 * After parsing a spreadsheet row: salvage lead_tagging when "Scored" (or another
 * tagging label) was placed in scored/appointment datetime columns, and default
 * lead_tagging to Scored when a real scored datetime is present but tagging is empty.
 */
export function finalizeImportedLeadRow(
  row: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...row };

  for (const tsKey of ["scored", "appointment"] as const) {
    const raw = out[tsKey];
    if (typeof raw !== "string") continue;
    if (!looksLikeLeadTaggingCell(raw)) continue;
    if (out.lead_tagging == null || out.lead_tagging === "") {
      out.lead_tagging = normalizeLeadTaggingValue(raw) ?? raw;
    }
    delete out[tsKey];
  }

  const hasScoredTs =
    out.scored != null &&
    out.scored !== "" &&
    typeof out.scored === "string" &&
    !looksLikeLeadTaggingCell(out.scored);
  const hasScoredTsNumber = typeof out.scored === "number" && Number.isFinite(out.scored);

  if (
    (hasScoredTs || hasScoredTsNumber) &&
    (out.lead_tagging == null || out.lead_tagging === "")
  ) {
    out.lead_tagging = LEAD_TAGGING_SCORED;
  }

  if (typeof out.lead_tagging === "string") {
    out.lead_tagging = normalizeLeadTaggingValue(out.lead_tagging) ?? out.lead_tagging;
  }

  return out;
}
