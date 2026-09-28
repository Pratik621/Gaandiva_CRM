/**
 * Timezone helpers shared by lead forms / payload mappers.
 *
 * - Registers the `utc` and `timezone` dayjs plugins exactly once.
 * - Exposes `DEFAULT_TIMEZONE` (browser-detected, falling back to UTC).
 * - Exposes a curated list of common IANA timezones used in the picker.
 * - Provides conversion helpers used when saving / loading wall-clock times.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const DEFAULT_TIMEZONE: string = (() => {
  try {
    const guess = dayjs.tz.guess?.();
    return typeof guess === "string" && guess.length > 0 ? guess : "UTC";
  } catch {
    return "UTC";
  }
})();

const COMMON_TIMEZONES_RAW = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Hong_Kong",
  "Asia/Karachi",
  "Asia/Bangkok",
  "Asia/Manila",
  "Asia/Riyadh",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Africa/Johannesburg",
];

export type TimezoneOption = { label: string; value: string };

const formatTimezoneLabel = (tz: string): string => {
  try {
    const offset = dayjs().tz(tz).format("Z");
    return `${tz.replace(/_/g, " ")} (UTC${offset})`;
  } catch {
    return tz;
  }
};

export const TIMEZONE_OPTIONS: TimezoneOption[] = Array.from(
  new Set([DEFAULT_TIMEZONE, ...COMMON_TIMEZONES_RAW]),
)
  .filter(Boolean)
  .map((tz) => ({ value: tz, label: formatTimezoneLabel(tz) }))
  .sort((a, b) => a.label.localeCompare(b.label));

const WALL_CLOCK_FORMAT = "YYYY-MM-DD HH:mm";

/**
 * Convert a UTC ISO timestamp into a "browser-local dayjs" whose H:M:D values
 * match the wall-clock for the given timezone. This is what the AntD DatePicker
 * needs to display the time as it appears in the selected timezone.
 */
export function utcIsoToWallClockDayjs(
  iso: string | null | undefined,
  tz: string,
): dayjs.Dayjs | undefined {
  if (!iso) return undefined;
  try {
    const wall = dayjs.utc(iso).tz(tz).format(WALL_CLOCK_FORMAT);
    return dayjs(wall);
  } catch {
    return dayjs(iso);
  }
}

/**
 * Convert a "browser-local dayjs" (whose wall-clock represents a time in
 * `tz`) into an absolute UTC ISO string. Used at save time.
 */
export function wallClockDayjsToUtcIso(
  value: dayjs.Dayjs | null | undefined,
  tz: string,
): string | null {
  if (!value || !dayjs.isDayjs(value)) return null;
  try {
    const wall = value.format(WALL_CLOCK_FORMAT);
    return dayjs.tz(wall, tz).utc().toISOString();
  } catch {
    return value.toISOString();
  }
}

/**
 * Re-interpret a wall-clock dayjs from one timezone to another, preserving the
 * underlying absolute moment. Used when the user changes the TZ picker.
 */
export function translateWallClockDayjs(
  value: dayjs.Dayjs | null | undefined,
  fromTz: string,
  toTz: string,
): dayjs.Dayjs | undefined {
  if (!value || !dayjs.isDayjs(value)) return undefined;
  if (fromTz === toTz) return value;
  try {
    const wall = value.format(WALL_CLOCK_FORMAT);
    const abs = dayjs.tz(wall, fromTz);
    return dayjs(abs.tz(toTz).format(WALL_CLOCK_FORMAT));
  } catch {
    return value;
  }
}
