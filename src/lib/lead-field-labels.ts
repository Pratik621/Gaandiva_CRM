/** User-facing label for `leads.special_comments`. */
export const LEAD_MEETING_NOTES_LABEL = "MEETING NOTES";

/** User-facing labels for lead datetime fields (DB columns unchanged: scored, appointment). */
export const LEAD_MEETING_SET_DATE_TIME_LABEL = "Scored Date & Time";
export const LEAD_MEETING_SET_TIMEZONE_LABEL = "Scored_timezone";
export const LEAD_MEETING_DATE_TIME_LABEL = "Appointment Date & Time";
export const LEAD_MEETING_DATE_TIMEZONE_LABEL = "Appointment_timezone";

/** CSV/Excel export headers keyed by `leads` column name. */
export const LEAD_DATETIME_EXPORT_HEADERS: Record<string, string> = {
  scored: LEAD_MEETING_SET_DATE_TIME_LABEL,
  scored_timezone: LEAD_MEETING_SET_TIMEZONE_LABEL,
  appointment: LEAD_MEETING_DATE_TIME_LABEL,
  appointment_timezone: LEAD_MEETING_DATE_TIMEZONE_LABEL,
};

/** CSV/Excel export headers for selected lead text fields (key = DB column). */
export const LEAD_FIELD_EXPORT_HEADERS: Record<string, string> = {
  special_comments: LEAD_MEETING_NOTES_LABEL,
};

function normalizeImportHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.:]+$/g, "");
}

/** Spreadsheet column header (any casing) → `leads` column name. */
const LEAD_DATETIME_IMPORT_HEADER_MAP: Record<string, string> = {
  scored: "scored",
  appointment: "appointment",
  scored_timezone: "scored_timezone",
  appointment_timezone: "appointment_timezone",
  // Current form / export headers
  [normalizeImportHeader(LEAD_MEETING_SET_DATE_TIME_LABEL)]: "scored",
  [normalizeImportHeader(LEAD_MEETING_SET_TIMEZONE_LABEL)]: "scored_timezone",
  [normalizeImportHeader(LEAD_MEETING_DATE_TIME_LABEL)]: "appointment",
  [normalizeImportHeader(LEAD_MEETING_DATE_TIMEZONE_LABEL)]: "appointment_timezone",
  // Legacy CSV / older labels (keep re-import working)
  "date meeting set": "scored",
  "date meeting set date and time": "scored",
  "date meeting set time zone": "scored_timezone",
  "meeting date and time": "appointment",
  "meeting date & time": "appointment",
  "meeting date and time zone": "appointment_timezone",
  "meeting date & time zone": "appointment_timezone",
  "scored date and time": "scored",
  "appointment date and time": "appointment",
};

/** Resolve a lowercased CSV/Excel header to a `leads` column key. */
export function resolveLeadDatetimeImportHeader(header: string): string | undefined {
  const normalized = normalizeImportHeader(header);
  return LEAD_DATETIME_IMPORT_HEADER_MAP[normalized];
}
