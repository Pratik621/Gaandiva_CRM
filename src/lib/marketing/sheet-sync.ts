import { createHash } from "crypto";
import * as XLSX from "xlsx";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Extracts the spreadsheet ID and gid (tab id) from any Google Sheets URL
 * (edit link, share link, etc.) and builds the public CSV export URL.
 * Requires the sheet to be shared "Anyone with the link can view" — no
 * Google API credentials needed for this path.
 */
export function buildSheetCsvExportUrl(sheetUrl: string): string | null {
  const idMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const spreadsheetId = idMatch[1];

  const gidMatch = sheetUrl.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

type ParsedRow = Record<string, string>;

// Matches Meta Lead Ads export headers (id, created_time, ad_id, ad_name,
// adset_id, adset_name, campaign_id, campaign_name, form_id, form_name,
// is_organic, platform, <custom questions>, full_name, email, phone_number,
// inbox_url, lead_status, Comment) as well as generic sheet headers.
const LEAD_ID_HEADER_ALIASES = ["id", "lead id", "leadgen id", "leadgen_id"];
const CAMPAIGN_ID_HEADER_ALIASES = ["campaign id", "campaignid", "campaign"];
const CAMPAIGN_NAME_HEADER_ALIASES = ["campaign name", "campaignname"];
export const NAME_HEADER_ALIASES = ["name", "full name", "lead name"];
export const PHONE_HEADER_ALIASES = ["phone", "phone number", "mobile", "mobile number", "contact number"];
export const EMAIL_HEADER_ALIASES = ["email", "email address", "e-mail"];
export const COMPANY_HEADER_ALIASES = ["company", "company name", "organization"];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

export function findValueByAliases(row: ParsedRow, aliases: string[]): string | null {
  for (const key of Object.keys(row)) {
    if (aliases.includes(normalizeHeader(key))) {
      const value = row[key];
      return typeof value === "string" ? value.trim() : String(value ?? "").trim();
    }
  }
  return null;
}

/** Meta exports phone numbers as "p:+919876543210" — keep just the +number. */
export function normalizePhone(value: string | null): string | null {
  if (!value) return value;
  return value.replace(/^p:\s*/i, "").trim() || null;
}

function hashRow(row: ParsedRow): string {
  const stable = Object.keys(row)
    .sort()
    .map((k) => `${k}=${row[k]}`)
    .join("|");
  return createHash("sha256").update(stable).digest("hex");
}

/**
 * Stable identity for a row, used to dedupe on re-sync. Prefers the
 * platform's own lead id (e.g. Meta's `id` column) when present, since that
 * stays constant even if other columns (lead_status, Comment) get edited
 * upstream — a content hash would wrongly treat an edited row as a new lead.
 * Falls back to a content hash only when no id-like column exists.
 */
/** Meta Lead Ads exports carry Meta's lead id as "l:1234…" (or bare digits). */
function metaLeadIdFromRow(row: ParsedRow): string | null {
  const rawId = findValueByAliases(row, LEAD_ID_HEADER_ALIASES)?.replace(/^l:/i, "");
  return rawId && /^\d{10,}$/.test(rawId) ? rawId : null;
}

function stableRowKey(row: ParsedRow): string {
  const externalId = findValueByAliases(row, LEAD_ID_HEADER_ALIASES);
  return externalId ? `id:${externalId}` : `hash:${hashRow(row)}`;
}

export interface SheetSyncResult {
  ok: boolean;
  rowsRead: number;
  campaignsUpserted: number;
  leadsInserted: number;
  error?: string;
}

/**
 * Fetches a registered Google Sheet (CSV export), groups rows by the
 * campaign id column (e.g. Meta Lead Ads' `campaign_id`), upserts a
 * simplified_campaigns row per distinct campaign (named from `campaign_name`
 * when present), and inserts any new simplified_leads rows — deduped by the
 * sheet's own lead id when available, or a content hash otherwise, so
 * re-syncing never creates duplicates.
 */
export async function syncAdSource(
  admin: AdminClient,
  adSource: { id: string; organization_id: string; sheet_url: string; label: string | null }
): Promise<SheetSyncResult> {
  const csvUrl = buildSheetCsvExportUrl(adSource.sheet_url);
  if (!csvUrl) {
    return { ok: false, rowsRead: 0, campaignsUpserted: 0, leadsInserted: 0, error: "Invalid Google Sheets URL" };
  }

  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) {
    return {
      ok: false,
      rowsRead: 0,
      campaignsUpserted: 0,
      leadsInserted: 0,
      error: `Could not fetch sheet (HTTP ${response.status}). Make sure it's shared "Anyone with the link can view".`,
    };
  }

  const csvText = await response.text();
  const workbook = XLSX.read(csvText, { type: "string" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: "" });

  if (rows.length === 0) {
    return { ok: true, rowsRead: 0, campaignsUpserted: 0, leadsInserted: 0 };
  }

  const rowsByCampaign = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const campaignId = findValueByAliases(row, CAMPAIGN_ID_HEADER_ALIASES) || "unspecified";
    const bucket = rowsByCampaign.get(campaignId) ?? [];
    bucket.push(row);
    rowsByCampaign.set(campaignId, bucket);
  }

  const externalCampaignNames = new Map<string, string>();
  for (const [externalCampaignId, campaignRows] of rowsByCampaign) {
    const campaignName = findValueByAliases(campaignRows[0], CAMPAIGN_NAME_HEADER_ALIASES);
    if (campaignName) externalCampaignNames.set(externalCampaignId, campaignName);
  }

  let campaignsUpserted = 0;
  let leadsInserted = 0;

  for (const [externalCampaignId, campaignRows] of rowsByCampaign) {
    const { data: existingCampaignRaw } = await admin
      .from("simplified_campaigns")
      .select("id")
      .eq("organization_id", adSource.organization_id)
      .eq("external_campaign_id", externalCampaignId)
      .maybeSingle();
    const existingCampaign = existingCampaignRaw as { id: string } | null;

    let campaignId: string;
    if (existingCampaign?.id) {
      campaignId = existingCampaign.id;
    } else {
      const displayName =
        externalCampaignNames.get(externalCampaignId) ||
        `${adSource.label || "Simplified Campaign"} — ${externalCampaignId}`;

      const { data: created, error: createError } = await admin
        .from("simplified_campaigns")
        .insert({
          organization_id: adSource.organization_id,
          name: displayName,
          external_campaign_id: externalCampaignId,
          simplified_ad_source_id: adSource.id,
          status: "active",
        } as never)
        .select("id")
        .single();

      if (createError || !created) {
        continue;
      }
      campaignId = (created as { id: string }).id;
      campaignsUpserted += 1;
    }

    for (const row of campaignRows) {
      const dedupeKey = stableRowKey(row);
      const { data: existingLeadRaw } = await admin
        .from("simplified_leads")
        .select("id")
        .eq("simplified_campaign_id", campaignId)
        .eq("source_row_hash", dedupeKey)
        .maybeSingle();
      const existingLead = existingLeadRaw as { id: string } | null;

      if (existingLead?.id) continue;

      // assigned_agent_id starts unassigned — sm_agent visibility is org-wide
      // now, not assignment-gated, but Marketing can still hand a specific
      // lead to a specific agent manually via the per-lead Agent column.
      const { error: insertError } = await admin.from("simplified_leads").insert({
        organization_id: adSource.organization_id,
        simplified_campaign_id: campaignId,
        name: findValueByAliases(row, NAME_HEADER_ALIASES),
        phone: normalizePhone(findValueByAliases(row, PHONE_HEADER_ALIASES)),
        email: findValueByAliases(row, EMAIL_HEADER_ALIASES),
        company_name: findValueByAliases(row, COMPANY_HEADER_ALIASES),
        raw_data: row,
        source_row_hash: dedupeKey,
        source: "google_sheet",
        // Shared with the Meta token sync — the org-wide unique index on
        // meta_lead_id stops the same Meta lead arriving twice via both paths.
        meta_lead_id: metaLeadIdFromRow(row),
        status: "new",
      } as never);

      if (!insertError) {
        leadsInserted += 1;
      }
    }
  }

  return { ok: true, rowsRead: rows.length, campaignsUpserted, leadsInserted };
}
