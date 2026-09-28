"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Drawer,
  Spin,
  Empty,
  Typography,
  Row,
  Col,
  Card,
  Progress,
  Tag,
  Divider,
  Button,
  message,
} from "antd";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  MailOutlined,
  EyeOutlined,
  AimOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  RiseOutlined,
  DownloadOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";
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

const { Title, Text } = Typography;

const CARD_STYLE = {
  borderRadius: 14,
  border: "1px solid #eef0f3",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
  height: "100%",
} as const;

const CHART_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#64748b"];

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #eef0f3",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
};

type Props = {
  open: boolean;
  onClose: () => void;
  campaignId: string;
};

function SectionHeader({
  icon,
  title,
  accent,
}: {
  icon: ReactNode;
  title: string;
  accent: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: `${accent}14`,
          color: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
        }}
      >
        {icon}
      </div>
      <Title level={5} style={{ margin: 0, fontWeight: 650, letterSpacing: -0.2 }}>
        {title}
      </Title>
    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
  accent = "#4f46e5",
  compact = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  compact?: boolean;
}) {
  return (
    <Card
      size="small"
      bordered
      style={{
        ...CARD_STYLE,
        borderTop: `3px solid ${accent}`,
      }}
      styles={{ body: { padding: compact ? "12px 14px" : "14px 16px" } }}
    >
      <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
        {label}
      </Text>
      <div
        style={{
          fontSize: compact ? 20 : 24,
          fontWeight: 700,
          marginTop: 6,
          lineHeight: 1.15,
          color: "#0f172a",
          letterSpacing: -0.4,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
      {hint ? (
        <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

function PercentKpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: unknown;
  accent: string;
}) {
  const n = parseNumeric(value);
  const display = formatReportPercent(value);
  const bar = n == null ? 0 : Math.max(0, Math.min(100, n));
  return (
    <Card
      size="small"
      bordered
      style={{ ...CARD_STYLE, borderTop: `3px solid ${accent}` }}
      styles={{ body: { padding: "14px 16px" } }}
    >
      <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
        {label}
      </Text>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          marginTop: 6,
          lineHeight: 1.15,
          color: "#0f172a",
          letterSpacing: -0.4,
        }}
      >
        {display}
      </div>
      <Progress
        percent={bar}
        showInfo={false}
        strokeColor={accent}
        trailColor="#f1f5f9"
        size="small"
        style={{ marginTop: 10, marginBottom: 0 }}
      />
    </Card>
  );
}

function hasMetricValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string" && !value.trim()) return false;
  return true;
}

function IndustryMixCard({
  security,
  safety,
  others,
}: {
  security: unknown;
  safety: unknown;
  others: unknown;
}) {
  const items = [
    { label: "Security", value: security, color: "#4f46e5" },
    { label: "Safety", value: safety, color: "#0ea5e9" },
    { label: "Others", value: others, color: "#64748b" },
  ].filter((item) => hasMetricValue(item.value));

  if (items.length === 0) return null;

  return (
    <Card
      size="small"
      bordered
      title="Industry Mix"
      style={{ ...CARD_STYLE, borderTop: "3px solid #64748b", height: "100%" }}
      styles={{ body: { padding: "14px 16px" }, header: { minHeight: 44, padding: "10px 16px" } }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((item) => {
          const n = parseNumeric(item.value);
          const bar = n == null ? 0 : Math.max(0, Math.min(100, n));
          return (
            <div key={item.label}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 4,
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 13, color: "#334155" }}>{item.label}</Text>
                <Text strong style={{ fontSize: 14, color: "#0f172a" }}>
                  {formatReportPercent(item.value)}
                </Text>
              </div>
              <Progress
                percent={bar}
                showInfo={false}
                strokeColor={item.color}
                trailColor="#f1f5f9"
                size="small"
                style={{ marginBottom: 0 }}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ScenarioCards({ entries }: { entries: NamedValueEntry[] | undefined }) {
  const items = chartEntriesFromNamed(entries, "seniority");
  if (items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No seniority data" />;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <Row gutter={[10, 10]}>
      {items.map((item, idx) => (
        <Col xs={12} sm={8} md={6} lg={4} key={item.name}>
          <Card
            size="small"
            style={{
              borderRadius: 12,
              background: "#fafbfc",
              border: "1px solid #eef0f3",
            }}
            styles={{ body: { padding: "12px 14px" } }}
          >
            <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
              {item.name}
            </Text>
            <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4, color: "#0f172a" }}>
              {item.value.toLocaleString("en-US")}
            </div>
            <Progress
              percent={Math.round((item.value / max) * 100)}
              showInfo={false}
              strokeColor={CHART_COLORS[idx % CHART_COLORS.length]}
              size="small"
              style={{ marginTop: 8, marginBottom: 0 }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

function RoleDonut({ entries }: { entries: NamedValueEntry[] | undefined }) {
  const data = chartEntriesFromNamed(entries, "role");
  if (data.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No role data" />;
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={78}
            paddingAngle={3}
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <RechartsTooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 14px",
          justifyContent: "center",
          padding: "4px 4px 2px",
          maxWidth: "100%",
        }}
      >
        {data.map((entry, i) => (
          <div
            key={entry.name}
            title={`${entry.name}: ${entry.value}%`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              maxWidth: "100%",
              minWidth: 0,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: CHART_COLORS[i % CHART_COLORS.length],
                flexShrink: 0,
              }}
            />
            <Text
              style={{
                fontSize: 11,
                lineHeight: 1.35,
                color: "#475569",
                whiteSpace: "normal",
                wordBreak: "break-word",
              }}
            >
              {entry.name}
              <span style={{ color: "#94a3b8", marginLeft: 4 }}>{entry.value}%</span>
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyBars({
  entries,
  color = "#4f46e5",
  name = "Count",
}: {
  entries: NamedValueEntry[] | undefined;
  color?: string;
  name?: string;
}) {
  const data = chartEntriesFromNamed(entries, "date");
  if (data.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No daily data" />;
  }
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} interval="preserveStartEnd" tickLine={false} />
        <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
        <RechartsTooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill={color} radius={[7, 7, 0, 0]} name={name} maxBarSize={42} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PacingArea({ entries }: { entries: NamedValueEntry[] | undefined }) {
  const gradId = useId().replace(/:/g, "");
  const data = chartEntriesFromNamed(entries, "date");
  if (data.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pacing data" />;
  }
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} interval="preserveStartEnd" tickLine={false} />
        <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
        <RechartsTooltip contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#4f46e5"
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          name="Sends"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BounceGauge({
  value,
  max,
  label,
}: {
  value: unknown;
  max: number;
  label: string;
}) {
  const n = parseNumeric(value);
  const pct = n == null ? 0 : Math.max(0, Math.min(100, (n / max) * 100));
  const display = n == null ? "—" : formatReportPercent(n);
  return (
    <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
      <Progress
        type="dashboard"
        percent={Number(pct.toFixed(1))}
        strokeColor={pct > 70 ? "#ef4444" : pct > 40 ? "#f59e0b" : "#10b981"}
        trailColor="#f1f5f9"
        format={() => (
          <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{display}</span>
        )}
        width={148}
      />
      <div style={{ marginTop: 10 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {label}
        </Text>
      </div>
    </div>
  );
}

function ReportBody({ report }: { report: CampaignPerformanceReportRow }) {
  const outbound = (report.outbound_data?.formData ?? {}) as Record<string, unknown>;
  const opens = (report.poc_opens_data?.formData ?? {}) as Record<string, unknown>;
  const clicks = (report.poc_clicks_data?.formData ?? {}) as Record<string, unknown>;
  const landing = (report.landing_page_data?.formData ?? {}) as Record<string, unknown>;
  const vitals = (report.web_vitals_data?.formData ?? {}) as Record<string, unknown>;

  // Match Campain_Report form keys (with legacy aliases for older demo rows).
  const opensTotal = pickFormValue(opens, ["totalECsOpened", "totalEcsOpened", "totalOpened"]);
  const opensRatio = pickFormValue(opens, ["ecOpenRatio", "openRatio"]);
  const clicksTotal = pickFormValue(clicks, ["totalECsClicked", "totalEcsClicked", "totalClicked"]);
  const clicksRatio = pickFormValue(clicks, ["ecClickRatio", "clickRatio"]);
  const tbtValue = pickFormValue(vitals, ["tbtScriptBlocks", "tbt"]);
  const lcpValue = pickFormValue(vitals, ["largestElementLCP", "largestContentfulPaint"]);
  const fcpValue = pickFormValue(vitals, ["firstContentfulPaint"]);
  const ttiValue = pickFormValue(vitals, ["timeToInteractive"]);
  const fullyLoaded = pickFormValue(vitals, ["fullyLoadedTime"]);
  const hasSecondaryVitals = [fcpValue, ttiValue, fullyLoaded].some((v) => v != null);

  const dateRange =
    report.start_date || report.end_date
      ? `${report.start_date ?? "—"} → ${report.end_date ?? "—"}`
      : "Date range not set";

  const screenshotSrc = useMemo(
    () => resolveCampaignReportScreenshotSrc(report.screenshot_data),
    [report.screenshot_data]
  );

  const stateBars = chartEntriesFromNamed(report.landing_page_data?.stateEntries, "state");
  const summary = useMemo(() => buildCampaignReportSummary(report), [report]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, paddingBottom: 12 }}>
      <div
        style={{
          borderRadius: 16,
          padding: "20px 22px",
          background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.4 }}>
              PERFORMANCE REPORT
            </Text>
            <Title level={3} style={{ margin: "4px 0 0", letterSpacing: -0.4 }}>
              {report.report_title || "Campaign Performance Report"}
            </Title>
            {report.report_subtitle ? (
              <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
                {report.report_subtitle}
              </Text>
            ) : null}
          </div>
          <Tag color="success" style={{ margin: 0, borderRadius: 999, padding: "2px 10px" }}>
            Completed
          </Tag>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          <Tag icon={<RiseOutlined />} color="blue">
            {dateRange}
          </Tag>
          {report.crm_campaign_code ? <Tag>{report.crm_campaign_code}</Tag> : null}
          {report.crm_campaign_id ? <Tag>{report.crm_campaign_id}</Tag> : null}
          {report.crm_campaign_name ? <Tag>{report.crm_campaign_name}</Tag> : null}
          {report.crm_client_name ? <Tag color="default">{report.crm_client_name}</Tag> : null}
        </div>
      </div>

      <section>
        <SectionHeader icon={<MailOutlined />} title="Outbound Performance" accent="#4f46e5" />
        <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
          <Col xs={12} md={6}>
            <KpiTile label="Total Sent" value={formatReportNumber(outbound.totalEmailsSent)} accent="#4f46e5" />
          </Col>
          <Col xs={12} md={6}>
            <KpiTile label="Delivered" value={formatReportNumber(outbound.totalEmailsDelivered)} accent="#0ea5e9" />
          </Col>
          <Col xs={12} md={6}>
            <KpiTile label="Daily Avg" value={formatReportNumber(outbound.dailyAvgSends)} accent="#10b981" />
          </Col>
          <Col xs={12} md={6}>
            <KpiTile label="Hard Bounced" value={formatReportNumber(outbound.totalHardBounced)} accent="#ef4444" />
          </Col>
        </Row>
        {(hasMetricValue(outbound.ecManagers) ||
          hasMetricValue(outbound.ecDirectors) ||
          hasMetricValue(outbound.securityPerc) ||
          hasMetricValue(outbound.safetyPerc) ||
          hasMetricValue(outbound.othersPerc)) && (
          <Row gutter={[12, 12]} style={{ marginBottom: 14 }} align="stretch">
            {hasMetricValue(outbound.ecManagers) && (
              <Col xs={12} md={6}>
                <PercentKpiTile label="EC Managers" value={outbound.ecManagers} accent="#4f46e5" />
              </Col>
            )}
            {hasMetricValue(outbound.ecDirectors) && (
              <Col xs={12} md={6}>
                <PercentKpiTile label="EC Directors" value={outbound.ecDirectors} accent="#0ea5e9" />
              </Col>
            )}
            {(hasMetricValue(outbound.securityPerc) ||
              hasMetricValue(outbound.safetyPerc) ||
              hasMetricValue(outbound.othersPerc)) && (
              <Col xs={24} md={12}>
                <IndustryMixCard
                  security={outbound.securityPerc}
                  safety={outbound.safetyPerc}
                  others={outbound.othersPerc}
                />
              </Col>
            )}
          </Row>
        )}
        <Row gutter={[12, 12]}>
          <Col xs={24} md={10}>
            <Card title="Job Role Mix" size="small" style={CARD_STYLE}>
              <RoleDonut entries={report.outbound_data?.jobRoleEntries} />
            </Card>
          </Col>
          <Col xs={24} md={6}>
            <Card title="Bounce Rate" size="small" style={CARD_STYLE}>
              <BounceGauge value={outbound.bounceRate} max={10} label="Email bounce (0–10%)" />
              {(report.soft_bounced || report.outbound_data?.softBounced) && (
                <Text type="secondary" style={{ fontSize: 11, display: "block", textAlign: "center" }}>
                  Soft bounced: {report.soft_bounced || report.outbound_data?.softBounced}
                </Text>
              )}
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card title="Daily Pacing" size="small" style={CARD_STYLE}>
              <PacingArea entries={report.outbound_data?.pacingEntries} />
            </Card>
          </Col>
        </Row>
        <Card title="Job Seniority" size="small" style={{ ...CARD_STYLE, marginTop: 12 }}>
          <ScenarioCards entries={report.outbound_data?.jobScenarioEntries} />
        </Card>
      </section>

      <Divider style={{ margin: 0 }} />

      <section>
        <SectionHeader icon={<EyeOutlined />} title="Email Open Report" accent="#0ea5e9" />
        <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
          <Col xs={12} md={8}>
            <KpiTile label="Total ECs Opened" value={formatReportNumber(opensTotal)} accent="#0ea5e9" />
          </Col>
          <Col xs={12} md={8}>
            <KpiTile label="EC Open Ratio" value={formatReportPercent(opensRatio)} accent="#4f46e5" />
          </Col>
        </Row>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={14}>
            <Card title="Daily Opens" size="small" style={CARD_STYLE}>
              <DailyBars entries={report.poc_opens_data?.barEntries} color="#0ea5e9" name="Opens" />
            </Card>
          </Col>
          <Col xs={24} md={10}>
            <Card title="Opens by Role" size="small" style={CARD_STYLE}>
              <RoleDonut entries={report.poc_opens_data?.jobRoleEntries} />
            </Card>
          </Col>
        </Row>
        <Card title="Open Seniority" size="small" style={{ ...CARD_STYLE, marginTop: 12 }}>
          <ScenarioCards entries={report.poc_opens_data?.jobScenarioEntries} />
        </Card>
      </section>

      <Divider style={{ margin: 0 }} />

      <section>
        <SectionHeader icon={<AimOutlined />} title="Email Click Report" accent="#10b981" />
        <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
          <Col xs={12} md={8}>
            <KpiTile label="Total ECs Clicked" value={formatReportNumber(clicksTotal)} accent="#10b981" />
          </Col>
          <Col xs={12} md={8}>
            <KpiTile label="EC Click Ratio" value={formatReportPercent(clicksRatio)} accent="#0ea5e9" />
          </Col>
        </Row>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={14}>
            <Card title="Daily Clicks" size="small" style={CARD_STYLE}>
              <DailyBars entries={report.poc_clicks_data?.barEntries} color="#10b981" name="Clicks" />
            </Card>
          </Col>
          <Col xs={24} md={10}>
            <Card title="Clicks by Role" size="small" style={CARD_STYLE}>
              <RoleDonut entries={report.poc_clicks_data?.jobRoleEntries} />
            </Card>
          </Col>
        </Row>
        <Card title="Click Seniority" size="small" style={{ ...CARD_STYLE, marginTop: 12 }}>
          <ScenarioCards entries={report.poc_clicks_data?.jobScenarioEntries} />
        </Card>
      </section>

      <Divider style={{ margin: 0 }} />

      <section>
        <SectionHeader icon={<GlobalOutlined />} title="Landing Page" accent="#f59e0b" />
        <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
          <Col xs={12} md={6}>
            <KpiTile label="Total Users" value={formatReportNumber(landing.totalUsers)} accent="#f59e0b" />
          </Col>
          <Col xs={12} md={6}>
            <KpiTile label="Avg Session (s)" value={formatReportNumber(landing.avgSession)} accent="#4f46e5" />
          </Col>
          <Col xs={12} md={6}>
            <KpiTile label="Bounced Users" value={formatReportNumber(landing.bouncedUsers)} accent="#ef4444" />
          </Col>
          <Col xs={12} md={6}>
            <KpiTile label="Form Downloads" value={formatReportNumber(landing.formDownloads)} accent="#10b981" />
          </Col>
        </Row>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={16}>
            <Card title="Audience by Location" size="small" style={CARD_STYLE}>
              {stateBars.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No location data" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={stateBars} margin={{ top: 8, right: 8, left: -4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={10}
                      interval={0}
                      angle={-22}
                      textAnchor="end"
                      height={58}
                      tickLine={false}
                    />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                    <RechartsTooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="#f59e0b" radius={[7, 7, 0, 0]} name="Users" maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card title="LP Bounce Rate" size="small" style={CARD_STYLE}>
              <BounceGauge value={landing.bounceRate} max={100} label="Landing bounce (0–100%)" />
            </Card>
          </Col>
        </Row>
      </section>

      <Divider style={{ margin: 0 }} />

      <section>
        <SectionHeader icon={<ThunderboltOutlined />} title="Web Vitals" accent="#64748b" />
        <Row gutter={[12, 12]}>
          <Col xs={12} md={6}>
            <KpiTile label="Avg Page Load (s)" value={formatReportNumber(vitals.avgPageLoadSpeed)} accent="#64748b" />
          </Col>
          <Col xs={12} md={6}>
            <KpiTile label="Structure Metric" value={formatReportPercent(vitals.structureMetrix)} accent="#4f46e5" />
          </Col>
          <Col xs={12} md={6}>
            <KpiTile label="Largest Element LCP (s)" value={formatReportNumber(lcpValue)} accent="#0ea5e9" />
          </Col>
          <Col xs={12} md={6}>
            <KpiTile label="TBT Script Blocks (ms)" value={formatReportNumber(tbtValue)} accent="#f59e0b" />
          </Col>
        </Row>
        {hasSecondaryVitals ? (
          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={12} md={6}>
              <KpiTile label="FCP (s)" value={formatReportNumber(fcpValue)} accent="#0ea5e9" />
            </Col>
            <Col xs={12} md={6}>
              <KpiTile label="TTI (s)" value={formatReportNumber(ttiValue)} accent="#10b981" />
            </Col>
            <Col xs={12} md={6}>
              <KpiTile label="Fully Loaded (s)" value={formatReportNumber(fullyLoaded)} accent="#ef4444" />
            </Col>
          </Row>
        ) : null}
        {screenshotSrc ? (
          <Card
            title="Speed Samples"
            size="small"
            style={{ ...CARD_STYLE, height: "auto", marginTop: 12 }}
            styles={{ body: { padding: 12 } }}
          >
            <div
              style={{
                width: "100%",
                overflowX: "auto",
                borderRadius: 10,
                border: "1px solid #eef0f3",
                background: "#f8fafc",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotSrc}
                alt="Speed samples visualization"
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: "100%",
                  height: "auto",
                  objectFit: "contain",
                }}
              />
            </div>
          </Card>
        ) : null}
      </section>

      <Divider style={{ margin: 0 }} />

      <section>
        <SectionHeader icon={<FileTextOutlined />} title="Summary" accent="#334155" />
        <div className="report-summary-beam-shell">
          <Card
            bordered={false}
            style={{
              ...CARD_STYLE,
              border: "none",
              boxShadow: "none",
              background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            }}
            styles={{ body: { padding: "20px 22px" } }}
          >
            <Text
              type="secondary"
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.5,
                display: "block",
                marginBottom: 10,
              }}
            >
              {summary.headline.toUpperCase()}
            </Text>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {summary.paragraphs.map((p) => (
                <Text key={p.slice(0, 32)} style={{ fontSize: 14, lineHeight: 1.65, color: "#334155" }}>
                  {p}
                </Text>
              ))}
            </div>
            {summary.highlights.length > 0 ? (
              <Row gutter={[10, 10]}>
                {summary.highlights.map((h) => (
                  <Col xs={12} sm={8} md={4} key={h.label}>
                    <div
                      style={{
                        borderRadius: 10,
                        border: "1px solid #eef0f3",
                        background: "#fff",
                        padding: "10px 12px",
                        height: "100%",
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                        {h.label}
                      </Text>
                      <Text strong style={{ fontSize: 16, color: "#0f172a" }}>
                        {h.value}
                      </Text>
                    </div>
                  </Col>
                ))}
              </Row>
            ) : null}
          </Card>
        </div>
      </section>
    </div>
  );
}

export default function CampaignPerformanceReportDrawer({ open, onClose, campaignId }: Props) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [report, setReport] = useState<CampaignPerformanceReportRow | null>(null);
  const [emptyMessage, setEmptyMessage] = useState("Report not available yet");

  useEffect(() => {
    if (!open || !campaignId) return;
    let cancelled = false;
    setLoading(true);
    setReport(null);

    fetchWithAuthRetry(`/api/command/campaigns/${campaignId}/performance-report`)
      .then(async (res) => {
        const body = (await res.json()) as {
          report?: CampaignPerformanceReportRow | null;
          message?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setReport(null);
          setEmptyMessage(body.error || "Failed to load report");
          return;
        }
        setReport(body.report ?? null);
        setEmptyMessage(body.message || "Report not available yet");
      })
      .catch(() => {
        if (!cancelled) {
          setReport(null);
          setEmptyMessage("Failed to load report");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, campaignId]);

  const handleDownloadPdf = async () => {
    if (!report) return;
    try {
      setDownloading(true);
      const { downloadCampaignPerformanceReportPdf } = await import(
        "@/lib/command/campaign-performance-report-pdf"
      );
      await downloadCampaignPerformanceReportPdf(report);
      message.success("Report PDF downloaded");
    } catch (err) {
      console.error("Campaign report PDF download failed:", err);
      message.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Drawer
      title="Campaign Report"
      open={open}
      onClose={onClose}
      width={1040}
      destroyOnClose
      styles={{ body: { paddingTop: 12, background: "#fcfcfd" } }}
      extra={
        report ? (
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={downloading}
            onClick={() => void handleDownloadPdf()}
          >
            Download
          </Button>
        ) : null
      }
    >
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
          <Spin size="large" />
        </div>
      ) : report ? (
        <ReportBody report={report} />
      ) : (
        <Empty style={{ padding: "80px 0" }} description={emptyMessage} />
      )}
    </Drawer>
  );
}
