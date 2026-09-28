import dayjs, { type Dayjs } from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";

dayjs.extend(quarterOfYear);

export type RevenueReportPeriod =
  | "monthly"
  | "3months"
  | "quarterly"
  | "yearly"
  | "custom";

export type ResolvedRevenuePeriod = {
  period: RevenueReportPeriod;
  date_from: string;
  date_to: string;
  label: string;
};

export const REVENUE_PERIOD_OPTIONS: Array<{
  value: RevenueReportPeriod;
  label: string;
}> = [
  { value: "monthly", label: "Monthly (This Month)" },
  { value: "3months", label: "Last 3 Months" },
  { value: "quarterly", label: "Quarterly (This Quarter)" },
  { value: "yearly", label: "Yearly (This Year)" },
  { value: "custom", label: "Custom Range" },
];

export function resolveRevenueReportPeriod(
  period: RevenueReportPeriod,
  customFrom?: string,
  customTo?: string
): ResolvedRevenuePeriod {
  const now = dayjs();

  if (period === "custom") {
    const from = customFrom?.trim() ? dayjs(customFrom.trim()) : now.startOf("month");
    const to = customTo?.trim() ? dayjs(customTo.trim()) : now.endOf("month");
    const safeFrom = from.isValid() ? from : now.startOf("month");
    const safeTo = to.isValid() ? to : now.endOf("month");
    const [start, end] = safeFrom.isAfter(safeTo) ? [safeTo, safeFrom] : [safeFrom, safeTo];
    return {
      period,
      date_from: start.format("YYYY-MM-DD"),
      date_to: end.format("YYYY-MM-DD"),
      label: `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`,
    };
  }

  if (period === "3months") {
    return {
      period,
      date_from: now.subtract(2, "month").startOf("month").format("YYYY-MM-DD"),
      date_to: now.endOf("month").format("YYYY-MM-DD"),
      label: "Last 3 Months",
    };
  }

  if (period === "quarterly") {
    return {
      period,
      date_from: now.startOf("quarter").format("YYYY-MM-DD"),
      date_to: now.endOf("quarter").format("YYYY-MM-DD"),
      label: `Q${now.quarter()} ${now.year()}`,
    };
  }

  if (period === "yearly") {
    return {
      period,
      date_from: now.startOf("year").format("YYYY-MM-DD"),
      date_to: now.endOf("year").format("YYYY-MM-DD"),
      label: `${now.year()}`,
    };
  }

  return {
    period: "monthly",
    date_from: now.startOf("month").format("YYYY-MM-DD"),
    date_to: now.endOf("month").format("YYYY-MM-DD"),
    label: now.format("MMMM YYYY"),
  };
}

export function periodToDayjsRange(
  resolved: Pick<ResolvedRevenuePeriod, "date_from" | "date_to">
): [Dayjs, Dayjs] {
  return [dayjs(resolved.date_from), dayjs(resolved.date_to)];
}

/** Inclusive end-of-day ISO bound for timestamptz queries. */
export function periodEndExclusiveIso(dateTo: string): string {
  return dayjs(dateTo).add(1, "day").startOf("day").toISOString();
}
