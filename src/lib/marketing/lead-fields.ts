// Shared helpers for pulling well-known fields out of a simplified_leads
// row's raw_data (the sheet's original columns, preserved verbatim). Used
// both server-side (campaigns list API, computing a display name per
// campaign) and client-side (campaign detail page).

export const PROPERTY_HEADER_ALIASES = [
  "how many properties do you manage",
  "properties managed",
  "property count",
  "number of properties",
];

export const AD_NAME_HEADER_ALIASES = ["ad name", "adname"];

export const LOCATION_HEADER_ALIASES = ["location", "city", "address"];

// Raw sheet columns already surfaced elsewhere in a lead's UI (contact block,
// or purely internal platform ids not useful to whoever is working the
// lead) — everything else in raw_data is shown generically under
// "Additional Details" by the shared AdditionalLeadDetails component.
export const SKIP_RAW_DATA_KEYS = new Set([
  "id",
  "name",
  "full name",
  "phone",
  "phone number",
  "email",
  "company",
  "company name",
  "ad id",
  "adset id",
  "campaign id",
  "form id",
  "adset name",
  "form name",
  "is organic",
  // Shown in the lead's Source block (getLeadSourceInfo) instead.
  "ad name",
  "campaign name",
  "created time",
  ...PROPERTY_HEADER_ALIASES,
  ...LOCATION_HEADER_ALIASES,
]);

export function humanizeFieldKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\?$/, "")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeFieldKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\?+$/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findRawValue(
  rawData: Record<string, string> | null | undefined,
  aliases: string[]
): string | null {
  if (!rawData) return null;
  for (const key of Object.keys(rawData)) {
    if (aliases.includes(normalizeFieldKey(key))) {
      const value = rawData[key];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    }
  }
  return null;
}

export function getPropertyValue(rawData: Record<string, string> | null | undefined): string | null {
  return findRawValue(rawData, PROPERTY_HEADER_ALIASES);
}

export function getAdName(rawData: Record<string, string> | null | undefined): string | null {
  return findRawValue(rawData, AD_NAME_HEADER_ALIASES);
}

export function getLocation(rawData: Record<string, string> | null | undefined): string | null {
  return findRawValue(rawData, LOCATION_HEADER_ALIASES);
}

/** Meta exports phone numbers as "p:+919876543210" — strip it for display. */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/^p:\s*/i, "").trim() || null;
}

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  meta: "Meta Lead Ads",
  google_sheet: "Google Sheet",
  manual: "Manual",
  import: "Excel Import",
};

export interface LeadSourceFields {
  source?: string | null;
  meta_form_id?: string | null;
  meta_form_name?: string | null;
  meta_campaign_name?: string | null;
  meta_adset_name?: string | null;
  meta_ad_name?: string | null;
  meta_created_time?: string | null;
  raw_data?: Record<string, string> | null;
}

/**
 * Where a lead came from, for display. Prefers the Meta columns the token
 * sync stores; falls back to the same fields in raw_data for leads that came
 * in through a Meta sheet export. Values are only what the source provided —
 * a missing campaign stays missing (never derived from the form name).
 */
export function getLeadSourceInfo(lead: LeadSourceFields) {
  const raw = lead.raw_data;
  const source = lead.source || "manual";
  return {
    source,
    sourceLabel: LEAD_SOURCE_LABELS[source] ?? source,
    formName: lead.meta_form_name || findRawValue(raw, ["form name"]),
    formId: lead.meta_form_id || null,
    campaignName: lead.meta_campaign_name || findRawValue(raw, ["campaign name"]),
    adsetName: lead.meta_adset_name || findRawValue(raw, ["adset name"]),
    adName: lead.meta_ad_name || getAdName(raw),
    metaCreatedTime: lead.meta_created_time || findRawValue(raw, ["created time"]),
  };
}

/** Picks the most common non-null value from a list, or null if none. */
export function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
