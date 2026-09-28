import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export function isValidTimeZone(tz: string | null): tz is string {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function utcStartOfDayInTz(dateStr: string, tz: string): string {
  return dayjs.tz(`${dateStr} 00:00:00.000`, "YYYY-MM-DD HH:mm:ss.SSS", tz).utc().toISOString();
}

export function utcEndOfDayInTz(dateStr: string, tz: string): string {
  return dayjs.tz(`${dateStr} 23:59:59.999`, "YYYY-MM-DD HH:mm:ss.SSS", tz).utc().toISOString();
}

export function resolveDateRangeParams(
  searchParams: URLSearchParams,
  defaultTz: string
): { startDate: string; endDate: string; tz: string; startUtc: string; endUtc: string } | { error: string } {
  const startDate = searchParams.get("start_date")?.trim();
  const endDate = searchParams.get("end_date")?.trim();
  if (!startDate || !endDate) {
    return { error: "start_date and end_date are required" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { error: "Invalid date format (use YYYY-MM-DD)" };
  }
  if (startDate > endDate) {
    return { error: "start_date must be on or before end_date" };
  }

  const tzParam = searchParams.get("tz");
  const tz = isValidTimeZone(tzParam) ? tzParam : defaultTz;

  return {
    startDate,
    endDate,
    tz,
    startUtc: utcStartOfDayInTz(startDate, tz),
    endUtc: utcEndOfDayInTz(endDate, tz),
  };
}
