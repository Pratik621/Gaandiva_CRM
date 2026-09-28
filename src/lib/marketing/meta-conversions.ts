import { createHash } from "crypto";
import type { AdminClient } from "@/lib/supabase/admin";
import { graphPost } from "./meta-graph";

// Meta Conversions API — CRM lead events ("Conversion Leads"). Each time an
// sm_agent moves a Meta lead to a new status, that stage is reported back to
// Meta against the original lead_id so ad delivery can optimise toward leads
// that actually progress. The event names below are the stage names to map
// in Events Manager when setting up the CRM funnel.
export const LEAD_STATUS_EVENT_NAMES: Record<string, string> = {
  new: "Lead",
  follow_up: "Follow Up",
  in_progress: "In Progress",
  closed: "Closed",
};

const LEAD_EVENT_SOURCE = "Gandiva CRM";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Meta's raw lead id: set directly for API-synced leads, or the "l:123…" id column of a sheet export. */
export function resolveMetaLeadId(lead: {
  meta_lead_id?: string | null;
  raw_data?: Record<string, string> | null;
}): string | null {
  if (lead.meta_lead_id && /^\d+$/.test(lead.meta_lead_id)) return lead.meta_lead_id;
  const rawId = lead.raw_data?.id?.trim().replace(/^l:/i, "");
  return rawId && /^\d{10,}$/.test(rawId) ? rawId : null;
}

export interface LeadStatusEventInput {
  organization_id: string;
  meta_lead_id?: string | null;
  raw_data?: Record<string, string> | null;
  email: string | null;
  phone: string | null;
  status: string;
}

export interface LeadStatusEventResult {
  sent: boolean;
  skipped?: string;
  error?: string;
}

/**
 * Sends one CRM lead event in the Conversions API shape:
 *   { data: [{ action_source: "system_generated", event_name, event_time,
 *              custom_data: { event_source: "crm", lead_event_source },
 *              user_data: { lead_id, em: [sha256], ph: [sha256] } }] }
 * Skipped (not an error) when the lead didn't come from Meta or the org has
 * no active Meta source with a dataset id configured.
 */
export async function sendLeadStatusEvent(
  admin: AdminClient,
  lead: LeadStatusEventInput
): Promise<LeadStatusEventResult> {
  const leadId = resolveMetaLeadId(lead);
  if (!leadId) return { sent: false, skipped: "not a Meta lead" };

  const eventName = LEAD_STATUS_EVENT_NAMES[lead.status];
  if (!eventName) return { sent: false, skipped: `no event for status ${lead.status}` };

  const { data: sourceRaw } = await admin
    .from("simplified_meta_sources")
    .select("access_token, dataset_id")
    .eq("organization_id", lead.organization_id)
    .eq("status", "active")
    .not("dataset_id", "is", null)
    .limit(1)
    .maybeSingle();
  const source = sourceRaw as { access_token: string; dataset_id: string } | null;
  if (!source) return { sent: false, skipped: "no Meta dataset configured" };

  const userData: Record<string, unknown> = { lead_id: "__LEAD_ID__" };
  const email = lead.email?.trim().toLowerCase();
  if (email) userData.em = [sha256(email)];
  const phoneDigits = lead.phone?.replace(/\D/g, "");
  if (phoneDigits) userData.ph = [sha256(phoneDigits)];

  const payload: Record<string, unknown> = {
    data: [
      {
        action_source: "system_generated",
        custom_data: { event_source: "crm", lead_event_source: LEAD_EVENT_SOURCE },
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        user_data: userData,
      },
    ],
  };
  const testEventCode = process.env.META_TEST_EVENT_CODE?.trim();
  if (testEventCode) payload.test_event_code = testEventCode;

  // Meta expects lead_id as a JSON number; lead ids can exceed
  // Number.MAX_SAFE_INTEGER, so splice the digits in as raw text instead of
  // round-tripping through a JS number.
  const body = JSON.stringify(payload).replace('"__LEAD_ID__"', leadId);

  try {
    await graphPost(`${source.dataset_id}/events`, source.access_token, body);
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Conversions API request failed" };
  }
}
