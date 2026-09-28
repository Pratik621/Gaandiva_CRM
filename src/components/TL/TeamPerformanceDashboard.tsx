"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  message,
  Progress,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AlertOutlined,
  BarChartOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CrownOutlined,
  DownloadOutlined,
  FireOutlined,
  FundProjectionScreenOutlined,
  ReloadOutlined,
  RiseOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  UserOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import dayjs from "dayjs";
import type {
  AgentPerformance,
  CampaignPerformance,
  QASummary,
  TeamPerformanceResponse,
  TLSummary,
} from "@/app/api/tl/team-performance/route";
import { TEAM_ASSIGNMENT_CHANNEL } from "@/lib/tl/team-sync";
import { useCachedApiQuery } from "@/hooks/useCachedApiQuery";

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;
const PERF_REFRESH_MS = 90_000;

// ─── Design tokens ──────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid #f0f0f0",
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

const PALETTE = ["#4f46e5", "#52c41a", "#f59e0b", "#722ed1", "#eb2f96", "#13c2c2", "#f59e0b", "#ef4444"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase() || "?";
}

// Returns actual signed days (b - a). Negative means b is in the past.
function daysBetween(a: string, b: string) {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

// Format a list of names: "A, B, C and 8 more"
function fmtNames(names: string[], max = 3) {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

function fmtDate(d: string | null) {
  return d ? dayjs(d).format("DD MMM YY") : "—";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <Space size={8}>
        <span style={{ color: "#4f46e5", fontSize: 18 }}>{icon}</span>
        <Title level={5} style={{ margin: 0, fontWeight: 700 }}>{title}</Title>
      </Space>
      {extra}
    </div>
  );
}

function KpiCard({
  icon,
  title,
  value,
  sub,
  color,
  loading,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color: string;
  loading?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Card style={{ ...card, height: "100%" }} styles={{ body: { padding: "18px 20px" } }}>
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <Space size={14} align="start" style={{ width: "100%" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: `${color}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              color,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text type="secondary" style={{ fontSize: 11, display: "block", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {title}
            </Text>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", lineHeight: 1.2, marginTop: 2 }}>
              {value}
            </div>
            {sub && <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: "block" }}>{sub}</Text>}
          </div>
          {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}
        </Space>
      )}
    </Card>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: 18 }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: 18 }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: 18 }}>🥉</span>;
  return <Tag style={{ minWidth: 28, textAlign: "center", borderRadius: 20, margin: 0 }}>{rank}</Tag>;
}

// ─── Alerts bar ──────────────────────────────────────────────────────────────

function AlertsBar({ data, today }: { data: TeamPerformanceResponse; today: string }) {
  const alerts: { type: "warning" | "error" | "info"; msg: string }[] = [];

  // Only flag agents who uploaded at least once in the last 7 days (actively working)
  // but have 0 uploads today. Avoids false alerts for agents inactive for weeks/months.
  const sevenDaysAgo = dayjs().subtract(7, "day").format("YYYY-MM-DD");
  const zeroToday = data.agents.filter(
    (a) => a.today_leads === 0 && a.last_upload_date && a.last_upload_date >= sevenDaysAgo
  );
  if (zeroToday.length > 0)
    alerts.push({
      type: "warning",
      msg: `${zeroToday.length} active agent${zeroToday.length > 1 ? "s" : ""} with 0 uploads today — ${fmtNames(zeroToday.map((a) => a.agent_name))}`,
    });

  // Only future end_dates that are within the next 7 days (strictly > today)
  const nearing = data.campaigns.filter((c) => {
    if (!c.end_date || c.status !== "active" || c.progress_pct >= 100) return false;
    if (c.end_date <= today) return false; // past/today = overdue, handled separately
    const daysLeft = daysBetween(today, c.end_date);
    return daysLeft > 0 && daysLeft <= 7;
  });
  if (nearing.length > 0)
    alerts.push({
      type: "warning",
      msg: `${nearing.length} active campaign${nearing.length > 1 ? "s" : ""} due within 7 days — ${fmtNames(nearing.map((c) => c.campaign_name))}`,
    });

  // Past end_date and not complete
  const overdue = data.campaigns.filter(
    (c) => c.end_date && c.end_date < today && c.status === "active" && c.progress_pct < 100
  );
  if (overdue.length > 0)
    alerts.push({
      type: "error",
      msg: `${overdue.length} overdue campaign${overdue.length > 1 ? "s" : ""} (past deadline, still active) — ${fmtNames(overdue.map((c) => c.campaign_name))}`,
    });

  const lowPerf = data.agents.filter((a) => a.avg_per_day < 0.5 && a.total_leads > 0).length;
  if (lowPerf > 0)
    alerts.push({ type: "info", msg: `${lowPerf} agent${lowPerf > 1 ? "s" : ""} with low avg upload rate (< 0.5/day)` });

  if (alerts.length === 0) return null;

  return (
    <Space direction="vertical" style={{ width: "100%", marginBottom: 20 }} size={8}>
      {alerts.map((a, i) => (
        <Alert
          key={i}
          type={a.type}
          showIcon
          message={a.msg}
          style={{ borderRadius: 10, padding: "8px 16px" }}
        />
      ))}
    </Space>
  );
}

// ─── Leaderboard cards ───────────────────────────────────────────────────────

function LeaderboardCard({
  title,
  icon,
  color,
  rows,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  rows: { name: string; value: number; sub?: string }[];
  loading?: boolean;
}) {
  return (
    <Card style={{ ...card, height: "100%" }} styles={{ body: { padding: "18px 20px" } }}>
      <SectionHeader icon={icon} title={title} />
      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" style={{ margin: "20px 0" }} />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }} size={10}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <RankBadge rank={i + 1} />
              <Avatar
                size={32}
                style={{ background: PALETTE[i % PALETTE.length], flexShrink: 0, fontSize: 12 }}
              >
                {initials(r.name)}
              </Avatar>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ fontSize: 13, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.name}
                </Text>
                {r.sub && <Text type="secondary" style={{ fontSize: 11 }}>{r.sub}</Text>}
              </div>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color,
                  background: `${color}14`,
                  borderRadius: 8,
                  padding: "2px 10px",
                  whiteSpace: "nowrap",
                }}
              >
                {r.value.toLocaleString()}
              </span>
            </div>
          ))}
        </Space>
      )}
    </Card>
  );
}

// ─── Campaign prediction card ─────────────────────────────────────────────────

function PredictionCard({ c, today }: { c: CampaignPerformance; today: string }) {
  const remaining = Math.max(0, c.total_allocation - c.total_uploaded);
  const daysLeft = c.end_date ? Math.max(0, daysBetween(today, c.end_date)) : null;
  const requiredPerDay = daysLeft && daysLeft > 0 ? Math.ceil(remaining / daysLeft) : null;

  const isOverdue = c.end_date && c.end_date < today && c.progress_pct < 100;
  const isNearing = !isOverdue && daysLeft !== null && daysLeft <= 7 && c.progress_pct < 100;
  const isComplete = c.progress_pct >= 100;

  const borderColor = isComplete ? "#52c41a" : isOverdue ? "#ef4444" : isNearing ? "#f59e0b" : "#4f46e5";

  return (
    <Card
      style={{ ...card, borderLeft: `4px solid ${borderColor}` }}
      styles={{ body: { padding: "16px 18px" } }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.campaign_name}
          </Text>
          {c.campaign_code && <Text type="secondary" style={{ fontSize: 11 }}>{c.campaign_code}</Text>}
        </div>
        <Tag
          color={isComplete ? "success" : isOverdue ? "error" : isNearing ? "warning" : "processing"}
          style={{ margin: 0, borderRadius: 20, fontSize: 11 }}
        >
          {isComplete ? "Complete" : isOverdue ? "Overdue" : isNearing ? "Due Soon" : "On Track"}
        </Tag>
      </div>

      <Progress
        percent={c.progress_pct}
        size="small"
        strokeColor={isComplete ? "#52c41a" : isOverdue ? "#ef4444" : isNearing ? "#f59e0b" : "#4f46e5"}
        style={{ marginBottom: 10 }}
      />

      <Row gutter={8}>
        <Col span={8}>
          <Text type="secondary" style={{ fontSize: 10, display: "block" }}>Uploaded</Text>
          <Text strong style={{ fontSize: 13 }}>{c.total_uploaded.toLocaleString()}</Text>
        </Col>
        <Col span={8}>
          <Text type="secondary" style={{ fontSize: 10, display: "block" }}>Remaining</Text>
          <Text strong style={{ fontSize: 13, color: remaining > 0 ? "#f59e0b" : "#52c41a" }}>
            {remaining.toLocaleString()}
          </Text>
        </Col>
        <Col span={8}>
          <Text type="secondary" style={{ fontSize: 10, display: "block" }}>Days Left</Text>
          <Text strong style={{ fontSize: 13, color: isOverdue ? "#ef4444" : "#0f172a" }}>
            {daysLeft !== null ? (isOverdue ? "Overdue" : `${daysLeft}d`) : "—"}
          </Text>
        </Col>
      </Row>

      {requiredPerDay !== null && !isComplete && (
        <div
          style={{
            marginTop: 10,
            padding: "6px 10px",
            background: "#f0f5ff",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ThunderboltOutlined style={{ color: "#4f46e5", fontSize: 13 }} />
          <Text style={{ fontSize: 12, color: "#4f46e5", fontWeight: 600 }}>
            Need {requiredPerDay} uploads/day to finish by {fmtDate(c.end_date)}
          </Text>
        </div>
      )}
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeamPerformanceDashboard() {
  const today = dayjs().format("YYYY-MM-DD");

  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(3, "month"),
    dayjs(),
  ]);
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const clientTimeZone = useMemo(() => {
    if (typeof Intl === "undefined") return "UTC";
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }, []);

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set("start_date", dateRange[0].format("YYYY-MM-DD"));
    p.set("end_date", dateRange[1].format("YYYY-MM-DD"));
    p.set("tz", clientTimeZone);
    if (campaignFilter) p.set("campaign_id", campaignFilter);
    if (userFilter) p.set("user_id", userFilter);
    return `/api/tl/team-performance?${p.toString()}`;
  }, [dateRange, clientTimeZone, campaignFilter, userFilter]);

  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useCachedApiQuery<TeamPerformanceResponse>(
    ["tl", "team-performance", apiUrl],
    apiUrl,
    { refetchInterval: PERF_REFRESH_MS }
  );

  const loading = isLoading && !data;
  const refreshing = isFetching && Boolean(data);
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load"
    : null;

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(TEAM_ASSIGNMENT_CHANNEL);
      ch.onmessage = () => void refetch();
    } catch {
      /* ignore */
    }
    return () => {
      if (ch) {
        ch.onmessage = null;
        ch.close();
      }
    };
  }, [refetch]);

  const isOM = data?.scope === "organization";
  const singleDayRange = data?.date_range?.single_day ?? false;
  const selectedDayLabel = data?.date_range?.start
    ? dayjs(data.date_range.start).format("DD MMM YYYY")
    : null;

  // ── Options ─────────────────────────────────────────────────────────────────
  const campaignOptions = useMemo(
    () => (data?.campaigns ?? []).map((c) => ({ value: c.campaign_id, label: c.campaign_name })),
    [data]
  );
  const userOptions = useMemo(
    () => (data?.agents ?? []).map((a) => ({ value: a.agent_id, label: a.agent_name })),
    [data]
  );

  const handleExport = async () => {
    if (!data) {
      message.warning("No data to export yet. Wait for the report to load.");
      return;
    }
    setExporting(true);
    try {
      const { downloadTeamPerformanceReport } = await import("@/lib/tl/team-performance-export");
      const campaignLabel = campaignFilter
        ? campaignOptions.find((o) => o.value === campaignFilter)?.label ?? campaignFilter
        : "All Campaigns";
      const agentLabel = userFilter
        ? userOptions.find((o) => o.value === userFilter)?.label ?? userFilter
        : "All Agents";
      downloadTeamPerformanceReport(data, {
        campaignLabel,
        agentLabel,
        exportedAt: dayjs().format("DD MMM YYYY HH:mm"),
      });
      message.success("Report downloaded");
    } catch {
      message.error("Failed to export report");
    } finally {
      setExporting(false);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────────
  const top5Agents = useMemo(() => (data?.agents ?? []).slice(0, 5), [data]);
  const bottom5Agents = useMemo(
    () =>
      [...(data?.agents ?? [])]
        .filter((a) => a.total_leads >= 0)
        .sort((a, b) => a.total_leads - b.total_leads)
        .slice(0, 5),
    [data]
  );
  const top5TLs = useMemo(() => (data?.tl_summaries ?? []).slice(0, 5), [data]);

  const activeCampaignPredictions = useMemo(
    () =>
      (data?.campaigns ?? [])
        .filter((c) => c.status === "active" && c.progress_pct < 100)
        .sort((a, b) => {
          if (!a.end_date && !b.end_date) return 0;
          if (!a.end_date) return 1;
          if (!b.end_date) return -1;
          return a.end_date.localeCompare(b.end_date);
        })
        .slice(0, 6),
    [data]
  );

  // ── Expected vs Actual ───────────────────────────────────────────────────────
  const expectedVsActual = useMemo(() => {
    if (!data) return [];
    const trend = data.daily_trend;
    if (trend.length < 2) return [];

    // Campaigns that have both start_date and end_date → can calculate daily rate
    const datedCampaigns = data.campaigns.filter(
      (c) => c.start_date && c.end_date && c.total_allocation > 0
    );

    let cumActual = 0;
    let cumExpected = 0;

    if (datedCampaigns.length > 0) {
      // For each day, sum the daily allocation rate of campaigns whose window
      // covers that day (total_allocation ÷ campaign_duration_days)
      return trend.map((t) => {
        cumActual += t.leads;
        let dailyTarget = 0;
        for (const c of datedCampaigns) {
          const start = c.start_date!;
          const end = c.end_date!;
          if (t.date < start || t.date > end) continue;
          const campDays = Math.max(1, daysBetween(start, end));
          dailyTarget += c.total_allocation / campDays;
        }
        cumExpected += dailyTarget;
        return {
          date: dayjs(t.date).format("DD MMM"),
          actual: Math.round(cumActual),
          expected: Math.round(cumExpected),
          daily: t.leads,
        };
      });
    }

    // Fallback (no campaign dates): show even distribution of actual uploads
    // as the "ideal baseline" — both lines end at the same total.
    const totalActual = trend.reduce((s, t) => s + t.leads, 0);
    if (totalActual === 0) return [];
    const perDay = totalActual / trend.length;
    return trend.map((t, i) => {
      cumActual += t.leads;
      return {
        date: dayjs(t.date).format("DD MMM"),
        actual: Math.round(cumActual),
        expected: Math.round(perDay * (i + 1)),
        daily: t.leads,
      };
    });
  }, [data]);

  // ── TL comparison chart ──────────────────────────────────────────────────────
  const tlChartData = useMemo(
    () =>
      (data?.tl_summaries ?? [])
        .slice(0, 8)
        .map((t) => ({ name: t.tl_name.split(" ")[0], total: t.total_leads, today: t.today_leads })),
    [data]
  );

  // ── Agent comparison chart ───────────────────────────────────────────────────
  const agentChartData = useMemo(
    () =>
      [...(data?.agents ?? [])]
        .sort((a, b) =>
          singleDayRange
            ? b.total_leads - a.total_leads
            : b.today_leads - a.today_leads || b.total_leads - a.total_leads
        )
        .slice(0, 8)
        .map((a) => ({
          name: a.agent_name.split(" ")[0],
          total: a.total_leads,
          today: a.today_leads,
        })),
    [data, singleDayRange]
  );

  // ── Campaign progress chart ──────────────────────────────────────────────────
  const campProgressData = useMemo(
    () =>
      (data?.campaigns ?? [])
        .slice(0, 8)
        .map((c) => ({
          name: c.campaign_name.length > 14 ? `${c.campaign_name.slice(0, 13)}…` : c.campaign_name,
          uploaded: c.total_uploaded,
          remaining: Math.max(0, c.total_allocation - c.total_uploaded),
          pct: c.progress_pct,
        })),
    [data]
  );

  const periodAgentCols: ColumnsType<AgentPerformance> = singleDayRange
    ? []
    : [
        {
          title: "Today",
          dataIndex: "today_leads",
          key: "today_leads",
          align: "center" as const,
          sorter: (a: AgentPerformance, b: AgentPerformance) => a.today_leads - b.today_leads,
          defaultSortOrder: "descend" as const,
          render: (v: number) => (
            <span
              style={{
                fontWeight: 600,
                color: v > 0 ? "#52c41a" : "#9ca3af",
                background: v > 0 ? "#f6ffed" : "transparent",
                borderRadius: 8,
                padding: "2px 10px",
              }}
            >
              {v}
            </span>
          ),
        },
        {
          title: "This Week",
          dataIndex: "week_leads",
          key: "week_leads",
          align: "center" as const,
          render: (v: number) => v.toLocaleString(),
        },
        {
          title: "This Month",
          dataIndex: "month_leads",
          key: "month_leads",
          align: "center" as const,
          render: (v: number) => v.toLocaleString(),
        },
      ];

  // ── Table columns ────────────────────────────────────────────────────────────
  const agentCols: ColumnsType<AgentPerformance> = [
    {
      title: "#",
      key: "rank",
      width: 52,
      render: (_: unknown, __: AgentPerformance, i: number) => <RankBadge rank={i + 1} />,
    },
    {
      title: "Agent",
      key: "agent",
      render: (_: unknown, r: AgentPerformance) => (
        <Space size={10}>
          <Avatar size={32} style={{ background: "#4f46e5", fontSize: 12 }}>{initials(r.agent_name)}</Avatar>
          <div>
            <Text strong style={{ fontSize: 13 }}>{r.agent_name}</Text>
            {r.agent_code && <Text type="secondary" style={{ display: "block", fontSize: 11 }}>{r.agent_code}</Text>}
          </div>
        </Space>
      ),
    },
    ...(isOM
      ? [{
          title: "TL",
          dataIndex: "tl_name" as keyof AgentPerformance,
          key: "tl_name",
          render: (v: unknown) =>
            v ? <Tag color="blue" style={{ borderRadius: 20 }}>{String(v)}</Tag> : <Text type="secondary">—</Text>,
        }]
      : []),
    {
      title: "Total",
      dataIndex: "total_leads",
      key: "total_leads",
      sorter: (a: AgentPerformance, b: AgentPerformance) => a.total_leads - b.total_leads,
      defaultSortOrder: singleDayRange ? ("descend" as const) : undefined,
      align: "center" as const,
      render: (v: number) => (
        <span style={{ fontWeight: 700, fontSize: 14, color: "#4f46e5", background: "#eef2ff", borderRadius: 8, padding: "2px 10px" }}>
          {v.toLocaleString()}
        </span>
      ),
    },
    {
      title: "Qualified",
      dataIndex: "qualified_leads",
      key: "qualified_leads",
      align: "center" as const,
      sorter: (a: AgentPerformance, b: AgentPerformance) => a.qualified_leads - b.qualified_leads,
      render: (v: number, r: AgentPerformance) => (
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: v > 0 ? "#389e0d" : "#9ca3af",
            background: v > 0 ? "#f6ffed" : "transparent",
            borderRadius: 8,
            padding: "2px 10px",
          }}
          title={
            r.total_leads > 0
              ? `${Math.round((v / r.total_leads) * 100)}% of ${r.total_leads} leads`
              : undefined
          }
        >
          {v.toLocaleString()}
        </span>
      ),
    },
    ...periodAgentCols,
    {
      title: "Avg/Day",
      dataIndex: "avg_per_day",
      key: "avg_per_day",
      align: "center" as const,
      sorter: (a: AgentPerformance, b: AgentPerformance) => a.avg_per_day - b.avg_per_day,
      render: (v: number) => (
        <Tag color={v >= 2 ? "success" : v >= 1 ? "warning" : "default"} style={{ borderRadius: 20 }}>
          {v.toFixed(1)}
        </Tag>
      ),
    },
    {
      title: "Last Upload",
      dataIndex: "last_upload_date",
      key: "last_upload_date",
      render: (v: string | null) =>
        v ? <Text style={{ fontSize: 12 }}>{dayjs(v).format("DD MMM YY")}</Text> : <Text type="secondary">—</Text>,
    },
  ];

  const tlCols: ColumnsType<TLSummary> = [
    {
      title: "#",
      key: "rank",
      width: 52,
      render: (_: unknown, __: TLSummary, i: number) => <RankBadge rank={i + 1} />,
    },
    {
      title: "Team Leader",
      key: "tl",
      render: (_: unknown, r: TLSummary) => (
        <Space size={10}>
          <Avatar size={32} style={{ background: "#722ed1", fontSize: 12 }}>{initials(r.tl_name)}</Avatar>
          <Text strong style={{ fontSize: 13 }}>{r.tl_name}</Text>
        </Space>
      ),
    },
    {
      title: "Agents",
      dataIndex: "agent_count",
      key: "agent_count",
      align: "center" as const,
      sorter: (a: TLSummary, b: TLSummary) => a.agent_count - b.agent_count,
      render: (v: number) => <Tag style={{ borderRadius: 20, minWidth: 32, textAlign: "center" }}>{v}</Tag>,
    },
    {
      title: "Campaigns",
      dataIndex: "campaign_count",
      key: "campaign_count",
      align: "center" as const,
      sorter: (a: TLSummary, b: TLSummary) => a.campaign_count - b.campaign_count,
      render: (v: number) => (
        <Tag color="blue" style={{ borderRadius: 20, minWidth: 32, textAlign: "center" }}>
          {v}
        </Tag>
      ),
    },
    {
      title: "Total",
      dataIndex: "total_leads",
      key: "total_leads",
      align: "center" as const,
      defaultSortOrder: "descend" as const,
      sorter: (a: TLSummary, b: TLSummary) => a.total_leads - b.total_leads,
      render: (v: number) => <span style={{ fontWeight: 700, color: "#4f46e5" }}>{v.toLocaleString()}</span>,
    },
    ...(singleDayRange
      ? []
      : [
          {
            title: "Today",
            dataIndex: "today_leads" as keyof TLSummary,
            key: "today_leads",
            align: "center" as const,
            render: (v: number) => (
              <span style={{ color: v > 0 ? "#52c41a" : "#9ca3af", fontWeight: 600 }}>{v}</span>
            ),
          },
          {
            title: "This Week",
            dataIndex: "week_leads" as keyof TLSummary,
            key: "week_leads",
            align: "center" as const,
            render: (v: number) => v.toLocaleString(),
          },
          {
            title: "This Month",
            dataIndex: "month_leads" as keyof TLSummary,
            key: "month_leads",
            align: "center" as const,
            render: (v: number) => v.toLocaleString(),
          },
        ]),
  ];

  const qaCols: ColumnsType<QASummary> = [
    {
      title: "#",
      key: "rank",
      width: 52,
      render: (_: unknown, __: QASummary, i: number) => <RankBadge rank={i + 1} />,
    },
    {
      title: "QA",
      key: "qa",
      render: (_: unknown, r: QASummary) => (
        <Space size={10}>
          <Avatar size={32} style={{ background: "#13c2c2", fontSize: 12 }}>{initials(r.qa_name)}</Avatar>
          <Text strong style={{ fontSize: 13 }}>{r.qa_name}</Text>
        </Space>
      ),
    },
    {
      title: "Total Audited",
      dataIndex: "total_audited",
      key: "total_audited",
      align: "center" as const,
      defaultSortOrder: "descend" as const,
      sorter: (a: QASummary, b: QASummary) => a.total_audited - b.total_audited,
      render: (v: number) => <span style={{ fontWeight: 700, color: "#4f46e5" }}>{v.toLocaleString()}</span>,
    },
    {
      title: "Qualified",
      dataIndex: "qualified_leads",
      key: "qualified_leads",
      align: "center" as const,
      sorter: (a: QASummary, b: QASummary) => a.qualified_leads - b.qualified_leads,
      render: (v: number, r: QASummary) => (
        <Tooltip title={`In app: ${r.app_qualified_leads} · Import sheet: ${r.imported_qualified_leads}`}>
          <span style={{ fontWeight: 600, color: v > 0 ? "#389e0d" : "#9ca3af" }}>{v.toLocaleString()}</span>
        </Tooltip>
      ),
    },
    {
      title: "Disqualified",
      dataIndex: "disqualified_leads",
      key: "disqualified_leads",
      align: "center" as const,
      sorter: (a: QASummary, b: QASummary) => a.disqualified_leads - b.disqualified_leads,
      render: (v: number, r: QASummary) => (
        <Tooltip title={`In app: ${r.app_disqualified_leads} · Import sheet: ${r.imported_disqualified_leads}`}>
          <span style={{ fontWeight: 600, color: v > 0 ? "#ef4444" : "#9ca3af" }}>{v.toLocaleString()}</span>
        </Tooltip>
      ),
    },
    {
      title: "Rectified",
      dataIndex: "rectified_leads",
      key: "rectified_leads",
      align: "center" as const,
      sorter: (a: QASummary, b: QASummary) => a.rectified_leads - b.rectified_leads,
      render: (v: number, r: QASummary) => (
        <Tooltip title={`In app: ${r.app_rectified_leads} · Import sheet: ${r.imported_rectified_leads}`}>
          <span style={{ fontWeight: 600, color: v > 0 ? "#722ed1" : "#9ca3af" }}>{v.toLocaleString()}</span>
        </Tooltip>
      ),
    },
    {
      title: "QA Comments",
      dataIndex: "with_qa_comments",
      key: "with_qa_comments",
      align: "center" as const,
      sorter: (a: QASummary, b: QASummary) => a.with_qa_comments - b.with_qa_comments,
      render: (v: number) => (
        <Tooltip title="Leads with QA comments filled">
          <Tag color={v > 0 ? "cyan" : "default"} style={{ borderRadius: 20, minWidth: 32, textAlign: "center" }}>
            {v}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: "Today",
      dataIndex: "today_audited",
      key: "today_audited",
      align: "center" as const,
      render: (v: number) => (
        <span style={{ color: v > 0 ? "#52c41a" : "#9ca3af", fontWeight: 600 }}>{v}</span>
      ),
    },
    {
      title: "This Week",
      dataIndex: "week_audited",
      key: "week_audited",
      align: "center" as const,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "This Month",
      dataIndex: "month_audited",
      key: "month_audited",
      align: "center" as const,
      render: (v: number) => v.toLocaleString(),
    },
  ];

  const campCols: ColumnsType<CampaignPerformance> = useMemo(() => {
    const progressCol: ColumnsType<CampaignPerformance>[number] = {
      title: "Progress",
      dataIndex: "progress_pct",
      key: "progress_pct",
      width: isOM ? 190 : 160,
      align: "center",
      sorter: (a: CampaignPerformance, b: CampaignPerformance) =>
        (a.progress_pct ?? 0) - (b.progress_pct ?? 0),
      showSorterTooltip: { target: "sorter-icon" },
      render: (v: number, r: CampaignPerformance) => (
        <Tooltip
          title={
            isOM
              ? `${(r.qualified_leads ?? 0).toLocaleString()} qualified of ${r.total_allocation.toLocaleString()} allocation`
              : `${r.total_uploaded.toLocaleString()} uploaded of ${r.total_allocation.toLocaleString()} allocation`
          }
        >
          <Space direction="vertical" size={2} style={{ width: "100%" }}>
            <Progress
              percent={v}
              size="small"
              showInfo={isOM}
              format={(p) => `${p ?? 0}%`}
              strokeColor={v >= 100 ? "#52c41a" : v >= 50 ? "#4f46e5" : "#f59e0b"}
            />
          </Space>
        </Tooltip>
      ),
    };

    return [
      {
        title: "Campaign",
        key: "campaign",
        render: (_: unknown, r: CampaignPerformance) => (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>{r.campaign_name}</Text>
            {r.campaign_code && <Text type="secondary" style={{ fontSize: 11 }}>{r.campaign_code}</Text>}
          </Space>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (s: string) => (
          <Tag
            color={s === "active" ? "green" : s === "completed" ? "green" : s === "paused" ? "orange" : "default"}
            style={{ borderRadius: 20 }}
          >
            {s}
          </Tag>
        ),
      },
      {
        title: "Allocation",
        dataIndex: "total_allocation",
        key: "total_allocation",
        align: "center" as const,
        render: (v: number) => v.toLocaleString(),
      },
      ...(isOM
        ? [
            {
              title: "Qualified",
              dataIndex: "qualified_leads",
              key: "qualified_leads",
              align: "center" as const,
              defaultSortOrder: "descend" as const,
              sorter: (a: CampaignPerformance, b: CampaignPerformance) =>
                (a.qualified_leads ?? 0) - (b.qualified_leads ?? 0),
              render: (v: number) => (
                <span
                  style={{
                    fontWeight: 700,
                    color: "#389e0d",
                    background: "#f6ffed",
                    borderRadius: 8,
                    padding: "2px 10px",
                  }}
                >
                  {(v ?? 0).toLocaleString()}
                </span>
              ),
            } as ColumnsType<CampaignPerformance>[number],
          ]
        : [
            {
              title: "Uploaded",
              dataIndex: "total_uploaded",
              key: "total_uploaded",
              align: "center" as const,
              defaultSortOrder: "descend" as const,
              sorter: (a: CampaignPerformance, b: CampaignPerformance) =>
                a.total_uploaded - b.total_uploaded,
              render: (v: number) => (
                <span
                  style={{
                    fontWeight: 700,
                    color: "#4f46e5",
                    background: "#eef2ff",
                    borderRadius: 8,
                    padding: "2px 10px",
                  }}
                >
                  {v.toLocaleString()}
                </span>
              ),
            } as ColumnsType<CampaignPerformance>[number],
          ]),
      progressCol,
      {
        title: "Agents",
        dataIndex: "agents_count",
        key: "agents_count",
        align: "center" as const,
      },
      {
        title: "Deadline",
        dataIndex: "end_date",
        key: "end_date",
        render: (v: string | null) => {
          if (!v) return <Text type="secondary">—</Text>;
          const past = v < today;
          return (
            <Text style={{ fontSize: 12, color: past ? "#ef4444" : "#0f172a" }}>{fmtDate(v)}</Text>
          );
        },
      },
    ];
  }, [isOM, today]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const s = data?.summary;

  return (
    <div style={{ padding: "0 4px" }}>
      {/* ── Filters + Export ── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }} align="middle">
        <Col xs={24} sm={12} md={8} lg={5}>
          <RangePicker
            value={dateRange}
            onChange={(v) => { if (v?.[0] && v?.[1]) setDateRange([v[0], v[1]]); }}
            style={{ width: "100%", borderRadius: 10 }}
            allowClear={false}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={5}>
          <Select
            placeholder="All Campaigns"
            allowClear
            style={{ width: "100%", borderRadius: 10 }}
            options={campaignOptions}
            value={campaignFilter}
            onChange={setCampaignFilter}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={5}>
          <Select
            placeholder="All Agents"
            allowClear
            style={{ width: "100%", borderRadius: 10 }}
            options={userOptions}
            value={userFilter}
            onChange={setUserFilter}
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={9}>
          <Space wrap style={{ width: "100%", justifyContent: "flex-end" }}>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={exporting}
              disabled={loading || !data}
              onClick={() => void handleExport()}
              style={{ borderRadius: 10 }}
            >
              Export Report
            </Button>
            <Button
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={() => void refetch()}
              style={{ borderRadius: 10 }}
            >
              Refresh
            </Button>
          </Space>
        </Col>
      </Row>

      {/* ── Error ── */}
      {error && (
        <Alert type="error" message={error} showIcon style={{ borderRadius: 10, marginBottom: 20 }} />
      )}

      {/* ── Alerts ── */}
      {data && <AlertsBar data={data} today={today} />}

      {/* ── OM KPI Cards ── */}
      {loading ? (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {Array.from({ length: isOM || !data ? 8 : 6 }).map((_, i) => (
            <Col xs={24} sm={12} md={8} xl={6} key={i}>
              <Card style={card}><Skeleton active paragraph={{ rows: 2 }} /></Card>
            </Col>
          ))}
        </Row>
      ) : isOM ? (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<FundProjectionScreenOutlined />} title="Total Campaigns" value={s?.total_campaigns ?? 0}
              sub={`${s?.active_campaigns ?? 0} active`} color="#4f46e5" />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<RiseOutlined />} title="Total Leads Uploaded" value={(s?.total_leads ?? 0).toLocaleString()}
              sub={
                singleDayRange && selectedDayLabel
                  ? `Selected day: ${selectedDayLabel}`
                  : `${(s?.week_leads ?? 0).toLocaleString()} in last 7 days (within range)`
              }
              color="#52c41a" />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard
              icon={<FireOutlined />}
              title={singleDayRange && selectedDayLabel ? `Uploads on ${selectedDayLabel}` : "Today Uploads"}
              value={(singleDayRange ? (s?.total_leads ?? 0) : (s?.today_leads ?? 0)).toLocaleString()}
              sub={
                singleDayRange
                  ? "Matches total for the selected date"
                  : `${(s?.month_leads ?? 0).toLocaleString()} in last 30 days (within range)`
              }
              color="#f59e0b"
              badge={
                (singleDayRange ? (s?.total_leads ?? 0) : (s?.today_leads ?? 0)) === 0 ? (
                  <Tag color="error">No uploads</Tag>
                ) : undefined
              }
            />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<CrownOutlined />} title="Active Team Leaders" value={s?.active_tl_count ?? 0}
              sub="With assigned agents" color="#722ed1" />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<TeamOutlined />} title="Active Agents" value={s?.active_agent_count ?? 0}
              sub="In scope" color="#13c2c2" />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<BarChartOutlined />} title="Avg Upload / Day" value={(s?.avg_per_day ?? 0).toFixed(1)}
              sub="Across all agents" color="#4f46e5" />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<AlertOutlined />} title="Pending Allocation" value={(s?.pending_allocation ?? 0).toLocaleString()}
              sub="Leads not yet uploaded" color="#ef4444" />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard
              icon={<CheckCircleOutlined />}
              title="Overall Completion"
              value={`${s?.completion_pct ?? 0}%`}
              sub={
                <Progress percent={s?.completion_pct ?? 0} size="small" showInfo={false}
                  strokeColor={s?.completion_pct && s.completion_pct >= 80 ? "#52c41a" : "#4f46e5"}
                  style={{ marginTop: 4 }} />
              }
              color="#52c41a"
            />
          </Col>
        </Row>
      ) : (
        /* TL KPI Cards */
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<TeamOutlined />} title="Assigned Agents" value={s?.active_agent_count ?? 0}
              sub="In your team" color="#722ed1" />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard
              icon={<FireOutlined />}
              title={singleDayRange && selectedDayLabel ? `Uploads on ${selectedDayLabel}` : "Today Uploads"}
              value={(singleDayRange ? (s?.total_leads ?? 0) : (s?.today_leads ?? 0)).toLocaleString()}
              color="#f59e0b"
              sub={
                singleDayRange
                  ? "In your selected date range"
                  : "By your agents on calendar today (within range)"
              }
              badge={
                (singleDayRange ? (s?.total_leads ?? 0) : (s?.today_leads ?? 0)) === 0 ? (
                  <Tag color="error">0</Tag>
                ) : undefined
              }
            />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<RiseOutlined />} title="Monthly Uploads" value={(s?.month_leads ?? 0).toLocaleString()}
              sub={`${(s?.week_leads ?? 0).toLocaleString()} this week`} color="#52c41a" />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<FundProjectionScreenOutlined />} title="Active Campaigns" value={s?.active_campaigns ?? 0}
              sub={`${s?.total_campaigns ?? 0} total`} color="#4f46e5" />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<BarChartOutlined />} title="Avg Upload / Day" value={(s?.avg_per_day ?? 0).toFixed(1)}
              sub="Team average" color="#13c2c2" />
          </Col>
          <Col xs={24} sm={12} md={8} xl={6}>
            <KpiCard icon={<AlertOutlined />} title="Pending Leads" value={(s?.pending_allocation ?? 0).toLocaleString()}
              sub="Allocation remaining" color="#ef4444" />
          </Col>
        </Row>
      )}

      {/* ── Daily Trend + TL Comparison ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} xl={isOM ? 14 : 24}>
          <Card style={card} styles={{ body: { padding: "20px 22px" } }}>
            <SectionHeader icon={<RiseOutlined />} title="Daily Upload Trend" />
            {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data?.daily_trend.map((d) => ({ ...d, date: dayjs(d.date).format("DD MMM") })) ?? []}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip contentStyle={{ borderRadius: 10 }} />
                  <Area type="monotone" dataKey="leads" stroke="#4f46e5" strokeWidth={2} fill="url(#trendGrad)" name="Uploads" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        {isOM && (
          <Col xs={24} xl={10}>
            <Card style={card} styles={{ body: { padding: "20px 22px" } }}>
              <SectionHeader icon={<CrownOutlined />} title="TL Performance" />
              {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={tlChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={70} />
                    <RTooltip contentStyle={{ borderRadius: 10 }} />
                    <Legend />
                    <Bar dataKey="total" name="Total" fill="#4f46e5" radius={[0, 6, 6, 0]}>
                      {tlChartData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>
        )}
      </Row>

      {/* ── Expected vs Actual + Campaign Progress ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} xl={14}>
          <Card style={card} styles={{ body: { padding: "20px 22px" } }}>
            <SectionHeader icon={<FundProjectionScreenOutlined />} title="Expected vs Actual Progress" />
            {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : expectedVsActual.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Not enough data" style={{ margin: "40px 0" }} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={expectedVsActual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip contentStyle={{ borderRadius: 10 }} />
                  <Legend />
                  <Area type="monotone" dataKey="actual" stroke="#52c41a" strokeWidth={2} fill="#f6ffed" name="Actual (cumulative)" dot={false} />
                  <Line type="monotone" dataKey="expected" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Expected (linear)" />
                  <Bar dataKey="daily" fill="#4f46e5" opacity={0.4} name="Daily uploads" radius={[3, 3, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card style={card} styles={{ body: { padding: "20px 22px" } }}>
            <SectionHeader icon={<BarChartOutlined />} title="Campaign Progress" />
            {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : campProgressData.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No campaigns" style={{ margin: "40px 0" }} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={campProgressData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                  <RTooltip contentStyle={{ borderRadius: 10 }} />
                  <Legend />
                  <Bar dataKey="uploaded" name="Uploaded" fill="#4f46e5" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="remaining" name="Remaining" fill="#f0f0f0" stackId="a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── Agent Performance Chart ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24}>
          <Card style={card} styles={{ body: { padding: "20px 22px" } }}>
            <SectionHeader
              icon={<UserOutlined />}
              title={
                singleDayRange && selectedDayLabel
                  ? `Agent Performance Graph (Top 8) — ${selectedDayLabel}`
                  : "Agent Performance Graph (Top 8)"
              }
            />
            {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : agentChartData.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No agents" style={{ margin: "40px 0" }} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={agentChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip contentStyle={{ borderRadius: 10 }} />
                  <Legend />
                  <Bar dataKey="total" name="Total Uploads" radius={[6, 6, 0, 0]}>
                    {agentChartData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                  {!singleDayRange && (
                    <Bar dataKey="today" name="Today (calendar)" fill="#52c41a" opacity={0.7} radius={[6, 6, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── Leaderboard ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={isOM ? 8 : 12}>
          <LeaderboardCard
            title="Top Agents"
            icon={<TrophyOutlined />}
            color="#52c41a"
            loading={loading}
            rows={top5Agents.map((a) => ({ name: a.agent_name, value: a.total_leads, sub: a.tl_name ?? undefined }))}
          />
        </Col>
        {isOM && (
          <Col xs={24} md={8}>
            <LeaderboardCard
              title="Top Team Leaders"
              icon={<CrownOutlined />}
              color="#722ed1"
              loading={loading}
              rows={top5TLs.map((t) => ({
                name: t.tl_name,
                value: t.total_leads,
                sub: `${t.agent_count} agents · ${t.campaign_count} campaigns`,
              }))}
            />
          </Col>
        )}
        <Col xs={24} md={isOM ? 8 : 12}>
          <LeaderboardCard
            title="Lowest Performers"
            icon={<WarningOutlined />}
            color="#ef4444"
            loading={loading}
            rows={bottom5Agents.map((a) => ({ name: a.agent_name, value: a.total_leads, sub: `Avg ${a.avg_per_day.toFixed(1)}/day` }))}
          />
        </Col>
      </Row>

      {/* ── Predictions ── */}
      {activeCampaignPredictions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader icon={<ClockCircleOutlined />} title="Campaign Completion Predictions" />
          <Row gutter={[16, 16]}>
            {activeCampaignPredictions.map((c) => (
              <Col xs={24} sm={12} xl={8} key={c.campaign_id}>
                <PredictionCard c={c} today={today} />
              </Col>
            ))}
          </Row>
        </div>
      )}

      {/* ── Agent Table ── */}
      <Card style={{ ...card, marginBottom: 24 }} styles={{ body: { padding: "0" } }}>
        <div style={{ padding: "18px 20px 12px" }}>
          <SectionHeader
            icon={<UserOutlined />}
            title={
              singleDayRange && selectedDayLabel
                ? `Agent-wise Performance — ${selectedDayLabel}`
                : "Agent-wise Performance"
            }
          />
        </div>
        <Table<AgentPerformance>
          dataSource={data?.agents ?? []}
          columns={agentCols}
          rowKey="agent_id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 10, size: "small", showSizeChanger: false }}
          rowClassName={(_, i) => (i < 3 ? "top-performer-row" : "")}
          style={{ borderRadius: "0 0 16px 16px", overflow: "hidden" }}
          scroll={{ x: "max-content" }}
        />
      </Card>

      {/* ── TL Table (OM only) ── */}
      {isOM && (
        <Card style={{ ...card, marginBottom: 24 }} styles={{ body: { padding: "0" } }}>
          <div style={{ padding: "18px 20px 12px" }}>
            <SectionHeader icon={<CrownOutlined />} title="TL-wise Summary" />
          </div>
          <Table<TLSummary>
            dataSource={data?.tl_summaries ?? []}
            columns={tlCols}
            rowKey="tl_id"
            size="small"
            loading={loading}
            pagination={{ pageSize: 10, size: "small", showSizeChanger: false }}
            style={{ borderRadius: "0 0 16px 16px", overflow: "hidden" }}
            scroll={{ x: "max-content" }}
          />
        </Card>
      )}

      {/* ── QA Table (OM only) ── */}
      {isOM && (
        <Card style={{ ...card, marginBottom: 24 }} styles={{ body: { padding: "0" } }}>
          <div style={{ padding: "18px 20px 12px" }}>
            <SectionHeader
              icon={<AuditOutlined />}
              title="QA-wise Summary"
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  In app: QA saves with auditor stamp. Import sheet: QA status from spreadsheet (audit date / QA auditor name).
                </Text>
              }
            />
          </div>
          <Table<QASummary>
            dataSource={data?.qa_summaries ?? []}
            columns={qaCols}
            rowKey="qa_id"
            size="small"
            loading={loading}
            pagination={{ pageSize: 10, size: "small", showSizeChanger: false }}
            locale={{ emptyText: "No QA audit activity in this period" }}
            style={{ borderRadius: "0 0 16px 16px", overflow: "hidden" }}
            scroll={{ x: "max-content" }}
          />
        </Card>
      )}

      {/* ── Campaign Table ── */}
      <Card style={card} styles={{ body: { padding: "0" } }}>
        <div style={{ padding: "18px 20px 12px" }}>
          <SectionHeader icon={<FundProjectionScreenOutlined />} title="Campaign-wise Performance" />
        </div>
        <Table<CampaignPerformance>
          dataSource={data?.campaigns ?? []}
          columns={campCols}
          rowKey="campaign_id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 10, size: "small", showSizeChanger: false }}
          style={{ borderRadius: "0 0 16px 16px", overflow: "hidden" }}
        />
      </Card>

      <style>{`
        .top-performer-row { background: #fffbe6 !important; }
        .top-performer-row:hover td { background: #fff7cc !important; }
      `}</style>
    </div>
  );
}
