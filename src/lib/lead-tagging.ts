import {
  CLOUDTHAT_AG_LEAD_TAGGING_VALUES,
  isCloudThatAgLeadTagging,
} from "@/lib/cloudthat-ag";

/** Canonical value stored in DB and shown in forms. */
export const LEAD_TAGGING_SCORED = "Scored";

/** Values that QA / MIS / scored pipelines treat as visible (Scored + CloudThat AG tags). */
export const QA_VISIBLE_LEAD_TAGGING_VALUES: string[] = [
  LEAD_TAGGING_SCORED,
  "scored",
  ...CLOUDTHAT_AG_LEAD_TAGGING_VALUES,
];

export function isScoredLeadTagging(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "scored";
}

/** True for classic Scored or CloudThat AG campaign tags (QA/MIS visibility). */
export function isQaVisibleLeadTagging(value: string | null | undefined): boolean {
  return isScoredLeadTagging(value) || isCloudThatAgLeadTagging(value);
}

/** Normalize import/form values to canonical "Scored" when case-insensitive match. */
export function normalizeLeadTaggingValue(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (isScoredLeadTagging(trimmed)) return LEAD_TAGGING_SCORED;
  return trimmed;
}

/**
 * True when a cell looks like a Lead Tagging dropdown value (not a datetime).
 * Used to salvage rows where agents put "Scored" in the scored-date column.
 */
export function looksLikeLeadTaggingCell(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return false;
  if (isScoredLeadTagging(trimmed)) return true;
  if (isCloudThatAgLeadTagging(trimmed)) return true;
  // Common tagging labels (case-insensitive) from LEAD_TAGGING_OPTIONS
  const lower = trimmed.toLowerCase();
  return (
    lower === "not interested" ||
    lower === "voicemail" ||
    lower === "call dropped" ||
    lower === "invalid number" ||
    lower === "number not reachable" ||
    lower === "call back" ||
    lower === "dead contact" ||
    lower === "gatekeeper declined" ||
    lower === "follow-up scheduled" ||
    lower === "follow up scheduled" ||
    lower === "do not call"
  );
}

/**
 * PostgREST filter: lead_tagging is Scored (any common casing) OR a
 * CloudThat AG scored-equivalent tag. Uses `.in()` so commas in tag values are safe.
 * Loose typing avoids Supabase query-builder deep instantiation errors when
 * chained after other `.in()` / `.eq()` filters.
 */
export function applyScoredLeadTaggingFilter<T>(query: T): T {
  return (query as { in: (column: string, values: readonly string[]) => T }).in(
    "lead_tagging",
    QA_VISIBLE_LEAD_TAGGING_VALUES
  );
}
