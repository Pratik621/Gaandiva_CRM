/** Campaign types where client_viewer lead tables omit the Appointment column. */
const HIDE_APPOINTMENT_CAMPAIGN_TYPES = new Set([
  "Email CS",
  "Email CS DT",
  "HQL",
  "BANT",
  "BANT-CCL",
  "BANT CCL",
  "AG",
]);

/** Campaign types where client_viewer lead tables omit the LHO file column. */
const HIDE_LHO_CAMPAIGN_TYPES = new Set([
  "Email CS",
  "Email CS DT",
  "HQL",
  "BANT",
  "BANT-CCL",
  "BANT CCL",
]);

/** Lead export keys omitted for client_viewer when Appointment is hidden. */
export const CLIENT_VIEWER_HIDDEN_EXPORT_KEYS = [
  "appointment",
  "appointment_timezone",
] as const;

function normalizeCampaignType(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isAgCampaignType(campaignType: string | null | undefined): boolean {
  return normalizeCampaignType(campaignType ?? "") === "AG";
}

export function clientViewerHidesAppointment(
  campaignType: string | null | undefined
): boolean {
  const normalized = normalizeCampaignType(campaignType ?? "");
  if (!normalized) return false;
  return HIDE_APPOINTMENT_CAMPAIGN_TYPES.has(normalized);
}

/** AG and other non-email/BANT types keep the LHO download column for client_viewer. */
export function clientViewerShowsLhoFile(
  campaignType: string | null | undefined
): boolean {
  const normalized = normalizeCampaignType(campaignType ?? "");
  if (!normalized) return true;
  if (normalized === "AG") return true;
  return !HIDE_LHO_CAMPAIGN_TYPES.has(normalized);
}
