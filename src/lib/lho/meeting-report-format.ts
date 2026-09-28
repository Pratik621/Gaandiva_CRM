import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const PREPARED_BY_DEFAULT = "Demand Pro LTD.";

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** e.g. 10th June 2026 */
export function formatMeetingReportDate(
  iso: string | null | undefined,
  tz?: string | null
): string {
  const raw = iso?.trim();
  if (!raw) return "";
  const zone = tz?.trim() || "UTC";
  const d = dayjs.utc(raw).tz(zone);
  if (!d.isValid()) return "";
  const day = d.date();
  return `${day}${ordinalSuffix(day)} ${d.format("MMMM YYYY")}`;
}

/** e.g. 4:30 PM CET */
export function formatMeetingReportTime(
  iso: string | null | undefined,
  tz?: string | null
): string {
  const raw = iso?.trim();
  if (!raw) return "";
  const zone = tz?.trim() || "UTC";
  const d = dayjs.utc(raw).tz(zone);
  if (!d.isValid()) return "";
  const time = d.format("h:mm A");
  const abbrev = timezoneAbbrev(zone, d);
  return abbrev ? `${time} ${abbrev}` : time;
}

function timezoneAbbrev(zone: string, d: dayjs.Dayjs): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "short",
    }).formatToParts(d.toDate());
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    if (name && name.length <= 6) return name;
  } catch {
    /* fall through */
  }
  const tail = zone.split("/").pop();
  return tail?.replace(/_/g, " ") ?? zone;
}

export function formatFullAddress(parts: {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}): string {
  const segments = [
    parts.address?.trim(),
    parts.city?.trim(),
    parts.state?.trim(),
    parts.zipCode?.trim(),
    parts.country?.trim(),
  ].filter(Boolean);
  return segments.join(", ");
}

export function resolvePreparedBy(value?: string | null): string {
  const v = value?.trim();
  return v || PREPARED_BY_DEFAULT;
}

export function resolveClientName(raw: Record<string, unknown>): string {
  const campaigns = raw.campaigns as { client_name?: string } | null | undefined;
  return (
    String(raw.client_name ?? "").trim() ||
    campaigns?.client_name?.trim() ||
    ""
  );
}

export function resolveAgentName(raw: Record<string, unknown>): string {
  const assigned = raw.assigned_user as { full_name?: string; email?: string } | null | undefined;
  return (
    String(raw.creator_display_name ?? "").trim() ||
    assigned?.full_name?.trim() ||
    assigned?.email?.trim() ||
    ""
  );
}
