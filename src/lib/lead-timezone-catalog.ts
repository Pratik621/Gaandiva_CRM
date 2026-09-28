import catalogJson from "@/data/lead-timezone-catalog.json";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

export type LeadTimezoneEntry = {
  country: string;
  iso2: string;
  cityRegion: string;
  usStates: string;
  ianaTimezone: string;
  windowsTimezone: string;
  utcOffset: string;
  searchKeywords: string;
};

export type LeadTimezoneSelectOption = {
  value: string;
  label: string;
  searchText: string;
};

export const LEAD_TIMEZONE_CATALOG = catalogJson as LeadTimezoneEntry[];

const BY_IANA = new Map<string, LeadTimezoneEntry>(
  LEAD_TIMEZONE_CATALOG.map((entry) => [entry.ianaTimezone, entry])
);

export function formatLeadTimezoneLabel(entry: LeadTimezoneEntry): string {
  return `${entry.country} — ${entry.cityRegion} (${entry.utcOffset})`;
}

function buildSearchText(entry: LeadTimezoneEntry): string {
  return [
    entry.searchKeywords,
    entry.country,
    entry.cityRegion,
    entry.iso2,
    entry.usStates,
    entry.utcOffset,
    entry.ianaTimezone,
    entry.windowsTimezone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export const LEAD_TIMEZONE_OPTIONS: LeadTimezoneSelectOption[] =
  LEAD_TIMEZONE_CATALOG.map((entry) => ({
    value: entry.ianaTimezone,
    label: formatLeadTimezoneLabel(entry),
    searchText: buildSearchText(entry),
  }));

/** Browser IANA zone when present in catalog; otherwise India/Kolkata, then UTC. */
export function getDefaultLeadTimezone(): string {
  if (BY_IANA.has(DEFAULT_TIMEZONE)) return DEFAULT_TIMEZONE;
  if (BY_IANA.has("Asia/Kolkata")) return "Asia/Kolkata";
  return LEAD_TIMEZONE_CATALOG[0]?.ianaTimezone ?? "UTC";
}

export function isKnownLeadTimezone(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return BY_IANA.has(value.trim());
}

/** Include a saved timezone when editing leads that predate the catalog. */
export function buildLeadTimezoneSelectOptions(
  knownValue?: string | null
): LeadTimezoneSelectOption[] {
  const trimmed = knownValue?.trim();
  if (!trimmed || isKnownLeadTimezone(trimmed)) {
    return LEAD_TIMEZONE_OPTIONS;
  }

  return [
    {
      value: trimmed,
      label: `${trimmed.replace(/_/g, " ")} (saved)`,
      searchText: trimmed.toLowerCase(),
    },
    ...LEAD_TIMEZONE_OPTIONS,
  ];
}

export function filterLeadTimezoneOption(
  input: string,
  option?: LeadTimezoneSelectOption
): boolean {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  return (option?.searchText ?? "").includes(q);
}
