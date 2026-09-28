import { COMPANY_INDUSTRY_SET } from "@/lib/lead-finder/industries";
import {
  COMPANY_SIZE_SET,
  EMAIL_STATUS_SET,
  FUNCTIONAL_SET,
  FUNDING_SET,
  LOCATION_SET,
  REVENUE_SET,
  SENIORITY_SET,
} from "@/lib/lead-finder/options";

/** Filter shape = 1:1 the lead engine's input schema. */
export type LeadFinderFilters = {
  contact_job_title?: string[];
  contact_not_job_title?: string[];
  seniority_level?: string[];
  functional_level?: string[];
  contact_location?: string[];
  contact_city?: string[];
  contact_not_location?: string[];
  contact_not_city?: string[];
  email_status?: string[];
  company_domain?: string[];
  size?: string[];
  company_industry?: string[];
  company_not_industry?: string[];
  company_keywords?: string[];
  company_not_keywords?: string[];
  min_revenue?: string;
  max_revenue?: string;
  funding?: string[];
  fetch_count: number;
  file_name: string;
};

/** Hard cap per run — Form Mode + JSON Mode + API all enforce this. */
export const MAX_FETCH_COUNT = 1_000;
export const FETCH_COUNT_WARN_THRESHOLD = 500;
/** Engine pricing (free tier): $2 per 1k leads + $0.02 start fee. */
export const COST_PER_1K_USD = 2;

export type RunStatus = "RUNNING" | "IMPORTING" | "SUCCEEDED" | "FAILED" | "ABORTED";

export type LeadFinderRun = {
  id: string;
  engine_run_id: string | null;
  dataset_id: string | null;
  filters: LeadFinderFilters;
  batch_name: string;
  status: RunStatus;
  total_found: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  progress: number;
  error_message: string | null;
  started_by: string | null;
  started_by_name?: string | null;
  created_at: string;
  finished_at: string | null;
};

/** Free-text array fields (no enum). */
const FREE_ARRAY_FIELDS = [
  "contact_job_title",
  "contact_not_job_title",
  "contact_city",
  "contact_not_city",
  "company_domain",
  "company_keywords",
  "company_not_keywords",
] as const;

/** Enum-validated array fields → allowed values (all lowercase slugs). */
const ENUM_ARRAY_FIELDS: Record<string, { set: Set<string>; hint: string; lowercase: boolean }> = {
  seniority_level: { set: SENIORITY_SET, hint: "seniority levels", lowercase: true },
  functional_level: { set: FUNCTIONAL_SET, hint: "functional levels", lowercase: true },
  contact_location: { set: LOCATION_SET, hint: "locations", lowercase: true },
  contact_not_location: { set: LOCATION_SET, hint: "locations", lowercase: true },
  email_status: { set: EMAIL_STATUS_SET, hint: "email statuses", lowercase: true },
  size: { set: COMPANY_SIZE_SET, hint: "company sizes", lowercase: false },
  company_industry: { set: COMPANY_INDUSTRY_SET, hint: "industries", lowercase: true },
  company_not_industry: { set: COMPANY_INDUSTRY_SET, hint: "industries", lowercase: true },
  funding: { set: FUNDING_SET, hint: "funding rounds", lowercase: true },
};

/**
 * Validate + normalize a raw filter object (form or pasted JSON).
 * Enum fields are checked against the engine's allowed values so bad input
 * fails here with a readable error, never at the engine.
 */
export function validateFilters(
  raw: unknown
): { filters: LeadFinderFilters; errors: [] } | { filters: null; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { filters: null, errors: ["Filters must be a JSON object"] };
  }
  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const cleanArray = (key: string): string[] | null => {
    const value = obj[key];
    if (value === undefined || value === null) return null;
    if (!Array.isArray(value)) {
      errors.push(`"${key}" must be an array of strings`);
      return null;
    }
    return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  };

  for (const key of FREE_ARRAY_FIELDS) {
    const cleaned = cleanArray(key);
    if (cleaned && cleaned.length > 0) out[key] = cleaned;
  }

  for (const [key, rule] of Object.entries(ENUM_ARRAY_FIELDS)) {
    let cleaned = cleanArray(key);
    if (!cleaned || cleaned.length === 0) continue;
    if (rule.lowercase) cleaned = cleaned.map((v) => v.toLowerCase());
    const invalid = cleaned.filter((v) => !rule.set.has(v));
    if (invalid.length > 0) {
      errors.push(
        `Unknown ${rule.hint}: ${invalid.map((v) => `"${v}"`).join(", ")} — use the Form Mode dropdown to see allowed values`
      );
      continue;
    }
    out[key] = cleaned;
  }

  for (const key of ["min_revenue", "max_revenue"] as const) {
    const value = obj[key];
    if (value === undefined || value === null || value === "") continue;
    const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (!REVENUE_SET.has(normalized)) {
      errors.push(`"${key}" must be one of: ${[...REVENUE_SET].join(", ")}`);
      continue;
    }
    out[key] = normalized;
  }

  const fetchCount = Number(obj.fetch_count);
  if (!Number.isInteger(fetchCount) || fetchCount < 1 || fetchCount > MAX_FETCH_COUNT) {
    errors.push(`"fetch_count" must be an integer between 1 and ${MAX_FETCH_COUNT}`);
  } else {
    out.fetch_count = fetchCount;
  }

  const fileName = typeof obj.file_name === "string" ? obj.file_name.trim() : "";
  if (!fileName) {
    errors.push('"file_name" is required (used as the batch name in the CRM)');
  } else {
    out.file_name = fileName;
  }

  if (errors.length > 0) return { filters: null, errors };
  return { filters: out as LeadFinderFilters, errors: [] };
}

export function estimateCostUsd(fetchCount: number): number {
  return Math.round(((fetchCount / 1000) * COST_PER_1K_USD + 0.02) * 100) / 100;
}
