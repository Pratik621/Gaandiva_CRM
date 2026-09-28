import dayjs from "dayjs";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

export type TimezoneSelectOption = {
  label: string;
  value: string;
  search: string;
  offsetMinutes: number;
};

export type GroupedTimezoneSelectOption = {
  label: string;
  options: TimezoneSelectOption[];
};

const REGION_LABELS: Record<string, string> = {
  Africa: "Africa",
  America: "Americas",
  Antarctica: "Antarctica",
  Arctic: "Arctic",
  Asia: "Asia",
  Atlantic: "Atlantic",
  Australia: "Australia & Pacific",
  Europe: "Europe",
  Indian: "Indian Ocean",
  Pacific: "Pacific",
  UTC: "UTC",
};

const FALLBACK_TIMEZONE_IDS = [
  "UTC",
  "Africa/Abidjan",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Manila",
  "Asia/Riyadh",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Australia/Melbourne",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Dublin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Zurich",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

function listTimezoneIds(): string[] {
  try {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      return Intl.supportedValuesOf("timeZone");
    }
  } catch {
    /* use fallback */
  }
  return FALLBACK_TIMEZONE_IDS;
}

function timezoneAbbrev(tz: string, at: Date): string {
  try {
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    if (name && name.length <= 6) return name;
  } catch {
    /* fall through */
  }
  return "";
}

function timezoneLongName(tz: string, at: Date): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "long",
      })
        .formatToParts(at)
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

function cityLabel(tz: string): string {
  if (!tz.includes("/")) return tz;
  return tz
    .split("/")
    .slice(1)
    .join(", ")
    .replace(/_/g, " ");
}

function offsetMinutesFor(tz: string, at: Date): number {
  try {
    return dayjs(at).tz(tz).utcOffset();
  } catch {
    return 0;
  }
}

function formatUtcOffset(tz: string, at: Date): string {
  try {
    return dayjs(at).tz(tz).format("Z");
  } catch {
    return "+00:00";
  }
}

export function buildTimezoneSelectOption(tz: string, at = new Date()): TimezoneSelectOption {
  const offset = formatUtcOffset(tz, at);
  const abbrev = timezoneAbbrev(tz, at);
  const longName = timezoneLongName(tz, at);
  const city = cityLabel(tz);
  const labelParts = [`(UTC${offset})`];
  if (abbrev) labelParts.push(abbrev);
  labelParts.push(city);
  if (longName && longName !== abbrev && longName !== city) {
    labelParts.push(`— ${longName}`);
  }
  const label = labelParts.join(" ");
  const search = [tz, city, abbrev, longName, offset, label]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    label,
    value: tz,
    search,
    offsetMinutes: offsetMinutesFor(tz, at),
  };
}

function buildSuggestedOptions(at: Date): TimezoneSelectOption[] {
  const pinned = Array.from(
    new Set([DEFAULT_TIMEZONE, "UTC", "Asia/Kolkata", "Europe/London", "America/New_York"])
  );
  return pinned.map((tz) => buildTimezoneSelectOption(tz, at));
}

function buildGroupedTimezoneOptions(at = new Date()): GroupedTimezoneSelectOption[] {
  const ids = Array.from(new Set([DEFAULT_TIMEZONE, "UTC", ...listTimezoneIds()]));
  const byRegion = new Map<string, TimezoneSelectOption[]>();

  for (const tz of ids) {
    const region = tz.includes("/") ? tz.split("/")[0] : "UTC";
    const option = buildTimezoneSelectOption(tz, at);
    const bucket = byRegion.get(region) ?? [];
    bucket.push(option);
    byRegion.set(region, bucket);
  }

  const groups: GroupedTimezoneSelectOption[] = [
    {
      label: "Suggested",
      options: buildSuggestedOptions(at).sort(
        (a, b) => a.offsetMinutes - b.offsetMinutes || a.label.localeCompare(b.label)
      ),
    },
  ];

  const regionOrder = Object.keys(REGION_LABELS);
  for (const region of regionOrder) {
    const options = byRegion.get(region);
    if (!options?.length) continue;
    options.sort(
      (a, b) => a.offsetMinutes - b.offsetMinutes || a.label.localeCompare(b.label)
    );
    groups.push({
      label: REGION_LABELS[region] ?? region,
      options,
    });
    byRegion.delete(region);
  }

  for (const [region, options] of byRegion.entries()) {
    options.sort(
      (a, b) => a.offsetMinutes - b.offsetMinutes || a.label.localeCompare(b.label)
    );
    groups.push({ label: region, options });
  }

  return groups;
}

let cachedGroupedOptions: GroupedTimezoneSelectOption[] | null = null;

export function getGroupedTimezoneOptions(): GroupedTimezoneSelectOption[] {
  if (!cachedGroupedOptions) {
    cachedGroupedOptions = buildGroupedTimezoneOptions();
  }
  return cachedGroupedOptions;
}

/** Keep legacy / free-text timezone values selectable when editing older leads. */
export function ensureTimezoneOption(
  value: string | null | undefined,
  groups: GroupedTimezoneSelectOption[]
): GroupedTimezoneSelectOption[] {
  const tz = value?.trim();
  if (!tz) return groups;

  const exists = groups.some((group) => group.options.some((opt) => opt.value === tz));
  if (exists) return groups;

  const legacyOption = buildTimezoneSelectOption(tz);
  return [
    {
      label: "Current value",
      options: [legacyOption],
    },
    ...groups,
  ];
}

export function filterTimezoneOption(input: string, option?: TimezoneSelectOption): boolean {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  if (!option) return false;
  return (
    option.label.toLowerCase().includes(q) ||
    option.value.toLowerCase().includes(q) ||
    option.search.includes(q)
  );
}
