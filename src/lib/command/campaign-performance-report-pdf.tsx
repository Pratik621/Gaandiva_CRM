"use client";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import {
  chartEntriesFromNamed,
  formatReportNumber,
  formatReportPercent,
  parseNumeric,
  pickFormValue,
  buildCampaignReportSummary,
  resolveCampaignReportScreenshotSrc,
  type CampaignPerformanceReportRow,
  type NamedValueEntry,
} from "@/lib/command/campaign-performance-report";

const ACCENT = "#4f46e5";
const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#64748b"];

/** A4 content box: ~595×842pt; keep margins so footer never collides. */
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 24,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  headerCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 7,
    color: "#64748b",
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 6,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tag: {
    backgroundColor: "#eef2ff",
    color: ACCENT,
    fontSize: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    marginRight: 5,
    marginBottom: 3,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 8,
    marginTop: 2,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f3",
  },
  kpiRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  kpiTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#eef0f3",
    borderRadius: 6,
    padding: 7,
    backgroundColor: "#ffffff",
    marginRight: 6,
  },
  kpiLabel: {
    fontSize: 6.5,
    color: "#64748b",
    marginBottom: 3,
  },
  kpiValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  card: {
    borderWidth: 1,
    borderColor: "#eef0f3",
    borderRadius: 7,
    padding: 8,
    marginBottom: 8,
    backgroundColor: "#ffffff",
  },
  cardTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#334155",
    marginBottom: 6,
  },
  twoCol: {
    flexDirection: "row",
    marginBottom: 8,
  },
  col: {
    flex: 1,
    marginRight: 6,
  },
  colLast: {
    flex: 1,
    marginRight: 0,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  barLabel: {
    width: 64,
    fontSize: 6.5,
    color: "#475569",
  },
  barTrack: {
    flex: 1,
    height: 7,
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 7,
    borderRadius: 3,
  },
  barValue: {
    width: 32,
    textAlign: "right",
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  scenarioGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  scenarioCard: {
    width: "18.5%",
    borderWidth: 1,
    borderColor: "#eef0f3",
    borderRadius: 5,
    padding: 5,
    backgroundColor: "#fafbfc",
    marginRight: "1.5%",
    marginBottom: 5,
  },
  scenarioName: {
    fontSize: 6,
    color: "#64748b",
    marginBottom: 2,
  },
  scenarioValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 24,
    right: 24,
    fontSize: 7,
    color: "#94a3b8",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 6,
  },
  screenshot: {
    width: "100%",
    maxHeight: 220,
    objectFit: "contain",
    borderRadius: 5,
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#f8fafc",
  },
  summaryEyebrow: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#64748b",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  summaryPara: {
    fontSize: 9.5,
    color: "#334155",
    lineHeight: 1.5,
    marginBottom: 7,
  },
  highlightRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  highlightChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#eef0f3",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginRight: 6,
    backgroundColor: "#ffffff",
  },
  highlightLabel: {
    fontSize: 6.5,
    color: "#64748b",
    marginBottom: 3,
  },
  highlightValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
});

function Kpi({
  label,
  value,
  accent,
  last = false,
}: {
  label: string;
  value: string;
  accent?: string;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.kpiTile,
        last ? { marginRight: 0 } : {},
        accent ? { borderTopWidth: 2, borderTopColor: accent } : {},
      ]}
      wrap={false}
    >
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.kpiRow} wrap={false}>
      {children}
    </View>
  );
}

function HorizontalBars({
  entries,
  labelKey,
  color = ACCENT,
  title,
  maxItems = 8,
}: {
  entries: NamedValueEntry[] | undefined;
  labelKey: "role" | "scenario" | "seniority" | "date" | "state";
  color?: string;
  title: string;
  maxItems?: number;
}) {
  const data = chartEntriesFromNamed(entries, labelKey).slice(0, maxItems);
  if (data.length === 0) {
    return (
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={{ color: "#94a3b8", fontSize: 8 }}>No data</Text>
      </View>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={styles.card} wrap={false}>
      <Text style={styles.cardTitle}>{title}</Text>
      {data.map((item, i) => (
        <View key={`${item.name}-${i}`} style={styles.barRow}>
          <Text style={styles.barLabel}>
            {item.name.length > 12 ? `${item.name.slice(0, 11)}…` : item.name}
          </Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.max(4, (item.value / max) * 100)}%`,
                  backgroundColor: COLORS[i % COLORS.length] || color,
                },
              ]}
            />
          </View>
          <Text style={styles.barValue}>{formatReportNumber(item.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function ScenarioGrid({
  entries,
  title = "Job Seniority",
}: {
  entries: NamedValueEntry[] | undefined;
  title?: string;
}) {
  const data = chartEntriesFromNamed(entries, "seniority").slice(0, 5);
  if (data.length === 0) return null;
  return (
    <View style={styles.card} wrap={false}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.scenarioGrid}>
        {data.map((item) => (
          <View key={item.name} style={styles.scenarioCard}>
            <Text style={styles.scenarioName}>
              {item.name.length > 16 ? `${item.name.slice(0, 15)}…` : item.name}
            </Text>
            <Text style={styles.scenarioValue}>{formatReportNumber(item.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PageFooter({
  report,
  pageLabel,
  pageNum,
  totalPages,
}: {
  report: CampaignPerformanceReportRow;
  pageLabel: string;
  pageNum: number;
  totalPages: number;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {report.crm_campaign_code || report.crm_campaign_id || "Campaign Report"} ·{" "}
        {report.crm_campaign_name || ""}
      </Text>
      <Text>
        {pageLabel} · {pageNum}/{totalPages}
      </Text>
    </View>
  );
}

function ReportHeader({ report }: { report: CampaignPerformanceReportRow }) {
  const dateRange =
    report.start_date || report.end_date
      ? `${report.start_date ?? "—"} → ${report.end_date ?? "—"}`
      : null;
  return (
    <View style={styles.headerCard} wrap={false}>
      <Text style={styles.eyebrow}>PERFORMANCE REPORT</Text>
      <Text style={styles.title}>{report.report_title || "Campaign Performance Report"}</Text>
      {report.report_subtitle ? <Text style={styles.subtitle}>{report.report_subtitle}</Text> : null}
      <View style={styles.tagRow}>
        {dateRange ? <Text style={styles.tag}>{dateRange}</Text> : null}
        {report.crm_campaign_code ? <Text style={styles.tag}>{report.crm_campaign_code}</Text> : null}
        {report.crm_campaign_id ? <Text style={styles.tag}>{report.crm_campaign_id}</Text> : null}
        {report.crm_client_name ? <Text style={styles.tag}>{report.crm_client_name}</Text> : null}
      </View>
    </View>
  );
}

function SummaryBlock({ report }: { report: CampaignPerformanceReportRow }) {
  const summary = buildCampaignReportSummary(report);
  const chips = summary.highlights.slice(0, 6);

  return (
    <View wrap={false}>
      <Text style={styles.sectionTitle}>Summary</Text>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryEyebrow}>{summary.headline.toUpperCase()}</Text>
        {summary.paragraphs.map((p) => (
          <Text key={p.slice(0, 48)} style={styles.summaryPara}>
            {p}
          </Text>
        ))}
        {chips.length > 0 ? (
          <View style={styles.highlightRow}>
            {chips.map((h, idx) => (
              <View
                key={h.label}
                style={[
                  styles.highlightChip,
                  idx === chips.length - 1 ? { marginRight: 0 } : {},
                ]}
              >
                <Text style={styles.highlightLabel}>{h.label}</Text>
                <Text style={styles.highlightValue}>{h.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function CampaignPerformanceReportDocument({
  report,
}: {
  report: CampaignPerformanceReportRow;
}) {
  const outbound = (report.outbound_data?.formData ?? {}) as Record<string, unknown>;
  const opens = (report.poc_opens_data?.formData ?? {}) as Record<string, unknown>;
  const clicks = (report.poc_clicks_data?.formData ?? {}) as Record<string, unknown>;
  const landing = (report.landing_page_data?.formData ?? {}) as Record<string, unknown>;
  const vitals = (report.web_vitals_data?.formData ?? {}) as Record<string, unknown>;

  const opensTotal = pickFormValue(opens, ["totalECsOpened", "totalEcsOpened", "totalOpened"]);
  const opensRatio = pickFormValue(opens, ["ecOpenRatio", "openRatio"]);
  const clicksTotal = pickFormValue(clicks, ["totalECsClicked", "totalEcsClicked", "totalClicked"]);
  const clicksRatio = pickFormValue(clicks, ["ecClickRatio", "clickRatio"]);
  const tbtValue = pickFormValue(vitals, ["tbtScriptBlocks", "tbt"]);
  const lcpValue = pickFormValue(vitals, ["largestElementLCP", "largestContentfulPaint"]);
  const fcpValue = pickFormValue(vitals, ["firstContentfulPaint"]);
  const ttiValue = pickFormValue(vitals, ["timeToInteractive"]);
  const fullyLoaded = pickFormValue(vitals, ["fullyLoadedTime"]);

  let screenshotSrc: string | null = null;
  if (typeof window !== "undefined") {
    screenshotSrc = resolveCampaignReportScreenshotSrc(report.screenshot_data, {
      origin: window.location.origin,
    });
  } else {
    screenshotSrc = resolveCampaignReportScreenshotSrc(report.screenshot_data);
  }

  const hasIndustry =
    outbound.securityPerc != null || outbound.safetyPerc != null || outbound.othersPerc != null;
  const hasSecondaryVitals = fcpValue != null || ttiValue != null || fullyLoaded != null;

  const TOTAL_PAGES = 4;

  return (
    <Document
      title={report.report_title || "Campaign Performance Report"}
      author="Gaandiva CRM"
    >
      {/* Page 1 — Cover + Outbound */}
      <Page size="A4" style={styles.page} wrap={false}>
        <ReportHeader report={report} />
        <Text style={styles.sectionTitle}>Outbound Performance</Text>
        <KpiRow>
          <Kpi label="Total Sent" value={formatReportNumber(outbound.totalEmailsSent)} accent="#4f46e5" />
          <Kpi label="Delivered" value={formatReportNumber(outbound.totalEmailsDelivered)} accent="#0ea5e9" />
          <Kpi label="Daily Avg" value={formatReportNumber(outbound.dailyAvgSends)} accent="#10b981" />
          <Kpi
            label="Hard Bounced"
            value={formatReportNumber(outbound.totalHardBounced)}
            accent="#ef4444"
            last
          />
        </KpiRow>
        {(outbound.ecManagers != null || outbound.ecDirectors != null || hasIndustry) && (
          <KpiRow>
            <Kpi label="EC Managers" value={formatReportPercent(outbound.ecManagers)} accent="#4f46e5" />
            <Kpi label="EC Directors" value={formatReportPercent(outbound.ecDirectors)} accent="#0ea5e9" />
            <Kpi label="Security %" value={formatReportPercent(outbound.securityPerc)} accent="#4f46e5" />
            <Kpi label="Safety %" value={formatReportPercent(outbound.safetyPerc)} accent="#0ea5e9" />
            <Kpi
              label="Others %"
              value={formatReportPercent(outbound.othersPerc)}
              accent="#64748b"
              last
            />
          </KpiRow>
        )}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <HorizontalBars
              title="Job Role Mix"
              entries={report.outbound_data?.jobRoleEntries}
              labelKey="role"
              maxItems={6}
            />
          </View>
          <View style={styles.colLast}>
            <View style={styles.card} wrap={false}>
              <Text style={styles.cardTitle}>Bounce Rate</Text>
              <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: "#10b981" }}>
                {formatReportPercent(outbound.bounceRate)}
              </Text>
              {(report.soft_bounced || report.outbound_data?.softBounced) && (
                <Text style={{ marginTop: 4, fontSize: 7, color: "#64748b" }}>
                  Soft bounced: {String(report.soft_bounced || report.outbound_data?.softBounced)}
                </Text>
              )}
            </View>
            <HorizontalBars
              title="Daily Pacing"
              entries={report.outbound_data?.pacingEntries}
              labelKey="date"
              color="#4f46e5"
              maxItems={8}
            />
          </View>
        </View>
        <ScenarioGrid entries={report.outbound_data?.jobScenarioEntries} title="Job Seniority" />
        <PageFooter report={report} pageLabel="Outbound" pageNum={1} totalPages={TOTAL_PAGES} />
      </Page>

      {/* Page 2 — Email Opens + Clicks */}
      <Page size="A4" style={styles.page} wrap={false}>
        <Text style={styles.sectionTitle}>Email Open Report</Text>
        <KpiRow>
          <Kpi label="Total ECs Opened" value={formatReportNumber(opensTotal)} accent="#0ea5e9" />
          <Kpi label="EC Open Ratio" value={formatReportPercent(opensRatio)} accent="#4f46e5" last />
        </KpiRow>
        <View style={styles.twoCol}>
          <View style={[styles.col, { flex: 1.35 }]}>
            <HorizontalBars
              title="Daily Opens"
              entries={report.poc_opens_data?.barEntries}
              labelKey="date"
              color="#0ea5e9"
              maxItems={8}
            />
          </View>
          <View style={styles.colLast}>
            <HorizontalBars
              title="Opens by Role"
              entries={report.poc_opens_data?.jobRoleEntries}
              labelKey="role"
              maxItems={6}
            />
          </View>
        </View>
        <ScenarioGrid entries={report.poc_opens_data?.jobScenarioEntries} title="Open Seniority" />

        <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Email Click Report</Text>
        <KpiRow>
          <Kpi label="Total ECs Clicked" value={formatReportNumber(clicksTotal)} accent="#10b981" />
          <Kpi label="EC Click Ratio" value={formatReportPercent(clicksRatio)} accent="#0ea5e9" last />
        </KpiRow>
        <View style={styles.twoCol}>
          <View style={[styles.col, { flex: 1.35 }]}>
            <HorizontalBars
              title="Daily Clicks"
              entries={report.poc_clicks_data?.barEntries}
              labelKey="date"
              color="#10b981"
              maxItems={8}
            />
          </View>
          <View style={styles.colLast}>
            <HorizontalBars
              title="Clicks by Role"
              entries={report.poc_clicks_data?.jobRoleEntries}
              labelKey="role"
              maxItems={6}
            />
          </View>
        </View>
        <ScenarioGrid entries={report.poc_clicks_data?.jobScenarioEntries} title="Click Seniority" />
        <PageFooter report={report} pageLabel="Email Open & Click Report" pageNum={2} totalPages={TOTAL_PAGES} />
      </Page>

      {/* Page 3 — Landing + Web Vitals */}
      <Page size="A4" style={styles.page} wrap={false}>
        <Text style={styles.sectionTitle}>Landing Page</Text>
        <KpiRow>
          <Kpi label="Total Users" value={formatReportNumber(landing.totalUsers)} accent="#f59e0b" />
          <Kpi label="Avg Session (s)" value={formatReportNumber(landing.avgSession)} accent="#4f46e5" />
          <Kpi label="Bounced Users" value={formatReportNumber(landing.bouncedUsers)} accent="#ef4444" />
          <Kpi
            label="Form Downloads"
            value={formatReportNumber(landing.formDownloads)}
            accent="#10b981"
            last
          />
        </KpiRow>
        <View style={styles.twoCol}>
          <View style={[styles.col, { flex: 1.5 }]}>
            <HorizontalBars
              title="Audience by Location"
              entries={report.landing_page_data?.stateEntries}
              labelKey="state"
              color="#f59e0b"
              maxItems={8}
            />
          </View>
          <View style={styles.colLast}>
            <View style={styles.card} wrap={false}>
              <Text style={styles.cardTitle}>LP Bounce Rate</Text>
              <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: "#f59e0b" }}>
                {formatReportPercent(landing.bounceRate)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 6 }]}>Web Vitals</Text>
        <KpiRow>
          <Kpi
            label="Avg Page Load (s)"
            value={formatReportNumber(vitals.avgPageLoadSpeed)}
            accent="#64748b"
          />
          <Kpi
            label="Structure Metric"
            value={formatReportPercent(vitals.structureMetrix)}
            accent="#4f46e5"
          />
          <Kpi label="LCP (s)" value={formatReportNumber(lcpValue)} accent="#0ea5e9" />
          <Kpi label="TBT (ms)" value={formatReportNumber(tbtValue)} accent="#f59e0b" last />
        </KpiRow>
        {hasSecondaryVitals ? (
          <KpiRow>
            <Kpi label="FCP (s)" value={formatReportNumber(fcpValue)} accent="#0ea5e9" />
            <Kpi label="TTI (s)" value={formatReportNumber(ttiValue)} accent="#10b981" />
            <Kpi
              label="Fully Loaded (s)"
              value={formatReportNumber(fullyLoaded)}
              accent="#ef4444"
              last
            />
          </KpiRow>
        ) : null}
        {screenshotSrc ? (
          <View style={styles.card} wrap={false}>
            <Text style={styles.cardTitle}>Speed Samples</Text>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image */}
            <Image src={screenshotSrc} style={styles.screenshot} />
          </View>
        ) : null}
        <PageFooter
          report={report}
          pageLabel="Landing & Web Vitals"
          pageNum={3}
          totalPages={TOTAL_PAGES}
        />
      </Page>

      {/* Page 4 — Summary alone (never orphaned) */}
      <Page size="A4" style={styles.page} wrap={false}>
        <SummaryBlock report={report} />
        <PageFooter report={report} pageLabel="Summary" pageNum={4} totalPages={TOTAL_PAGES} />
      </Page>
    </Document>
  );
}

export async function downloadCampaignPerformanceReportPdf(
  report: CampaignPerformanceReportRow
): Promise<void> {
  const blob = await pdf(<CampaignPerformanceReportDocument report={report} />).toBlob();
  const code = report.crm_campaign_code || report.crm_campaign_id || "campaign";
  const safe = String(code).replace(/[^\w.-]+/g, "_");
  const fileName = `Campaign_Report_${safe}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
