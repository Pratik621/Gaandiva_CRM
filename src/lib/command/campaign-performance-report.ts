/**
 * Campaign Performance Report — types + access helpers.
 * Source of truth: public.campaign_performance_reports (filled by external Campaign Report Generator).
 */

// TODO: expand Campaign Report visibility beyond Shlok S (ssshlok554@gmail.com).
export const CAMPAIGN_REPORT_MVP_EMAIL = "ssshlok554@gmail.com";

/** Per-email allowlist: View Report only on these campaign UUIDs. */
export const CAMPAIGN_REPORT_EMAIL_CAMPAIGN_ALLOWLIST: Record<
  string,
  readonly string[]
> = {
  "kstagnito2@rh-hub.com": [
    "4562aeae-e14b-4c24-b6c5-c63c9d9e8bbb", // Fierce Biotech – BIO Preview 2026
    "92e6bc07-b9f8-49e0-829b-fe39c6ac5f72", // PMMI Media Group - Columbia Machine, Inc.; ...
    "06038f73-3764-4300-a6c8-81a157674a65", // Broadsign Pilot - MQL Content Syndication
  ],
  "kstagnito@rh-hub.com": [
    "06038f73-3764-4300-a6c8-81a157674a65", // Broadsign Pilot - MQL Content Syndication
  ],
};

export type NamedValueEntry = {
  id?: string;
  role?: string;
  /** Generator still stores seniority labels under `scenario`; prefer `seniority` when present. */
  scenario?: string;
  seniority?: string;
  date?: string;
  state?: string;
  value?: string | number | null;
};

export type OutboundFormData = {
  reportTitle?: string;
  reportSubtitle?: string;
  startDate?: string;
  endDate?: string;
  totalEmailsSent?: string | number;
  totalEmailsDelivered?: string | number;
  dailyAvgSends?: string | number;
  totalHardBounced?: string | number;
  bounceRate?: string | number;
  securityPerc?: string | number;
  safetyPerc?: string | number;
  othersPerc?: string | number;
  ecManagers?: string | number;
  ecDirectors?: string | number;
  [key: string]: unknown;
};

export type OutboundData = {
  formData?: OutboundFormData;
  pacingEntries?: NamedValueEntry[];
  jobRoleEntries?: NamedValueEntry[];
  jobScenarioEntries?: NamedValueEntry[];
  softBounced?: string;
  selectedCampaign?: Record<string, unknown>;
  savedAt?: string;
};

export type PocSectionFormData = {
  /** Generator form keys (canonical): totalECsOpened, ecOpenRatio */
  totalECsOpened?: string | number;
  ecOpenRatio?: string | number;
  totalECsClicked?: string | number;
  ecClickRatio?: string | number;
  openManager?: string | number;
  openDirector?: string | number;
  clicksManager?: string | number;
  clicksDirector?: string | number;
  /** Legacy / demo aliases — kept for backward compatibility */
  totalEcsOpened?: string | number;
  openRatio?: string | number;
  totalEcsClicked?: string | number;
  clickRatio?: string | number;
  [key: string]: unknown;
};

export type PocSectionData = {
  formData?: PocSectionFormData;
  barEntries?: NamedValueEntry[];
  jobRoleEntries?: NamedValueEntry[];
  jobScenarioEntries?: NamedValueEntry[];
  savedAt?: string;
};

export type LandingPageFormData = {
  totalUsers?: string | number;
  avgSession?: string | number;
  bouncedUsers?: string | number;
  formDownloads?: string | number;
  bounceRate?: string | number;
  [key: string]: unknown;
};

export type LandingPageData = {
  formData?: LandingPageFormData;
  stateEntries?: NamedValueEntry[];
  savedAt?: string;
};

export type WebVitalsFormData = {
  avgPageLoadSpeed?: string | number;
  structureMetrix?: string | number;
  largestElementLCP?: string | number;
  /** Generator form primary key */
  tbtScriptBlocks?: string | number;
  tbt?: string | number;
  firstContentfulPaint?: string | number;
  timeToInteractive?: string | number;
  largestContentfulPaint?: string | number;
  fullyLoadedTime?: string | number;
  reducedDNSConnectionTime?: string | number;
  backend?: string | number;
  orcadedTime?: string | number;
  [key: string]: unknown;
};

export type WebVitalsData = {
  formData?: WebVitalsFormData;
  speedEntries?: Array<{ id?: string; value?: string | number | null }>;
  savedAt?: string;
};

export type CampaignPerformanceReportRow = {
  id: string;
  report_title: string;
  report_subtitle: string;
  start_date: string | null;
  end_date: string | null;
  soft_bounced: string | null;
  outbound_data: OutboundData;
  poc_opens_data: PocSectionData;
  poc_clicks_data: PocSectionData;
  landing_page_data: LandingPageData;
  web_vitals_data: WebVitalsData;
  screenshot_data: string | null;
  is_outbound_saved: boolean;
  is_poc_opens_saved: boolean;
  is_poc_clicks_saved: boolean;
  is_landing_page_saved: boolean;
  is_web_vitals_saved: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  crm_campaign_uuid: string | null;
  crm_campaign_id: string | null;
  crm_campaign_name: string | null;
  crm_campaign_code: string | null;
  crm_client_name: string | null;
};

export function isCampaignReportMvpUser(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === CAMPAIGN_REPORT_MVP_EMAIL;
}

function normalizeReportEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** True when this email may open View Report for the given campaign UUID. */
export function canViewCampaignPerformanceReport(
  email: string | null | undefined,
  campaignUuid: string | null | undefined
): boolean {
  if (isCampaignReportMvpUser(email)) return true;
  if (!campaignUuid) return false;
  const allowed =
    CAMPAIGN_REPORT_EMAIL_CAMPAIGN_ALLOWLIST[normalizeReportEmail(email)];
  return !!allowed?.includes(campaignUuid);
}

export function parseNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,%]/g, "").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatReportNumber(value: unknown, fallback = "—"): string {
  const n = parseNumeric(value);
  if (n == null) {
    if (typeof value === "string" && value.trim()) return value.trim();
    return fallback;
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatReportPercent(value: unknown, fallback = "—"): string {
  const n = parseNumeric(value);
  if (n == null) {
    if (typeof value === "string" && value.trim()) {
      return value.includes("%") ? value.trim() : `${value.trim()}%`;
    }
    return fallback;
  }
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

/** Resolve screenshot_data for <img> / react-pdf (data URL, absolute URL, or public path). */
export function resolveCampaignReportScreenshotSrc(
  screenshotData: string | null | undefined,
  opts?: { origin?: string | null }
): string | null {
  const raw = screenshotData?.trim();
  if (!raw) return null;
  if (raw.startsWith("data:")) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) {
    const encodedPath =
      "/" +
      raw
        .replace(/^\//, "")
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
    const origin = (opts?.origin ?? "").replace(/\/$/, "");
    return origin ? `${origin}${encodedPath}` : encodedPath;
  }
  return `data:image/png;base64,${raw}`;
}

/** First defined non-empty field from generator / legacy aliases. */
export function pickFormValue(
  form: Record<string, unknown> | null | undefined,
  keys: string[]
): unknown {
  if (!form) return undefined;
  for (const key of keys) {
    const v = form[key];
    if (v == null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    return v;
  }
  return undefined;
}

export function chartEntriesFromNamed(
  entries: NamedValueEntry[] | undefined,
  labelKey: "role" | "scenario" | "seniority" | "date" | "state"
): Array<{ name: string; value: number }> {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((e, i) => {
      const rawLabel =
        labelKey === "seniority"
          ? e.seniority ?? e.scenario
          : labelKey === "scenario"
            ? e.scenario ?? e.seniority
            : e[labelKey];
      const name =
        typeof rawLabel === "string" && rawLabel.trim()
          ? rawLabel.trim()
          : `Item ${i + 1}`;
      const value = parseNumeric(e.value) ?? 0;
      return { name, value };
    })
    .filter((e) => e.name.length > 0);
}

export type CampaignReportSummary = {
  headline: string;
  paragraphs: string[];
  highlights: Array<{ label: string; value: string }>;
};

/** Auto-build a short professional summary from completed report metrics. */
export function buildCampaignReportSummary(
  report: CampaignPerformanceReportRow
): CampaignReportSummary {
  const outbound = (report.outbound_data?.formData ?? {}) as Record<string, unknown>;
  const opens = (report.poc_opens_data?.formData ?? {}) as Record<string, unknown>;
  const clicks = (report.poc_clicks_data?.formData ?? {}) as Record<string, unknown>;
  const landing = (report.landing_page_data?.formData ?? {}) as Record<string, unknown>;
  const vitals = (report.web_vitals_data?.formData ?? {}) as Record<string, unknown>;

  const campaignLabel =
    report.crm_campaign_name ||
    report.crm_campaign_code ||
    report.crm_campaign_id ||
    "This campaign";
  const dateRange =
    report.start_date || report.end_date
      ? `${report.start_date ?? "—"} to ${report.end_date ?? "—"}`
      : null;

  const sent = formatReportNumber(outbound.totalEmailsSent);
  const delivered = formatReportNumber(outbound.totalEmailsDelivered);
  const bounce = formatReportPercent(outbound.bounceRate);
  const opensTotal = formatReportNumber(
    pickFormValue(opens, ["totalECsOpened", "totalEcsOpened", "totalOpened"])
  );
  const openRatio = formatReportPercent(
    pickFormValue(opens, ["ecOpenRatio", "openRatio"])
  );
  const clicksTotal = formatReportNumber(
    pickFormValue(clicks, ["totalECsClicked", "totalEcsClicked", "totalClicked"])
  );
  const clickRatio = formatReportPercent(
    pickFormValue(clicks, ["ecClickRatio", "clickRatio"])
  );
  const users = formatReportNumber(landing.totalUsers);
  const lpBounce = formatReportPercent(landing.bounceRate);
  const downloads = formatReportNumber(landing.formDownloads);
  const loadSpeed = formatReportNumber(vitals.avgPageLoadSpeed);
  const lcp = formatReportNumber(
    pickFormValue(vitals, ["largestElementLCP", "largestContentfulPaint"])
  );
  const structure = formatReportPercent(vitals.structureMetrix);

  const topRole = chartEntriesFromNamed(report.outbound_data?.jobRoleEntries, "role").sort(
    (a, b) => b.value - a.value
  )[0];
  const topState = chartEntriesFromNamed(report.landing_page_data?.stateEntries, "state").sort(
    (a, b) => b.value - a.value
  )[0];

  const paragraphs: string[] = [];

  paragraphs.push(
    dateRange
      ? `${campaignLabel} ran from ${dateRange}${report.crm_client_name ? ` for ${report.crm_client_name}` : ""}.`
      : `${campaignLabel}${report.crm_client_name ? ` for ${report.crm_client_name}` : ""} completed its performance reporting cycle.`
  );

  if (sent !== "—" || delivered !== "—") {
    paragraphs.push(
      `Outbound delivered ${delivered} of ${sent} emails with a ${bounce} hard-bounce rate` +
        (topRole ? `, led by ${topRole.name} in role mix` : "") +
        "."
    );
  }

  if (opensTotal !== "—" || clicksTotal !== "—") {
    paragraphs.push(
      `Email engagement reached ${opensTotal} opens (${openRatio}) and ${clicksTotal} clicks (${clickRatio}).`
    );
  }

  if (users !== "—") {
    paragraphs.push(
      `The landing page attracted ${users} users` +
        (topState ? `, with strongest traffic from ${topState.name}` : "") +
        `, ${downloads} form downloads, and a ${lpBounce} bounce rate.`
    );
  }

  if (loadSpeed !== "—" || lcp !== "—") {
    paragraphs.push(
      `Web vitals show ${loadSpeed}s average load` +
        (lcp !== "—" ? `, ${lcp}s LCP` : "") +
        (structure !== "—" ? `, and a ${structure} structure score` : "") +
        "."
    );
  }

  const highlights: Array<{ label: string; value: string }> = [
    { label: "Delivered", value: delivered },
    { label: "Open ratio", value: openRatio },
    { label: "Click ratio", value: clickRatio },
    { label: "LP users", value: users },
    { label: "LP bounce", value: lpBounce },
    { label: "Avg load", value: loadSpeed === "—" ? "—" : `${loadSpeed}s` },
  ].filter((h) => h.value !== "—");

  return {
    headline: "Executive Summary",
    paragraphs,
    highlights: highlights.slice(0, 6),
  };
}
