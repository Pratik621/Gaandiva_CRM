"use client";

import { useMemo, type ReactNode } from "react";
import { Card, Row, Col, Typography, Progress, Tag, Alert } from "antd";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import dayjs from "dayjs";
import {
  computeCampaignAverageAnalysis,
  type DailyLeadCount,
} from "@/lib/campaign-average-analysis";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  RocketOutlined,
  UploadOutlined,
  CalendarOutlined,
  ThunderboltOutlined,
  FundOutlined,
} from "@ant-design/icons";

const { Text, Title } = Typography;

type Props = {
  startDate: string | null;
  endDate: string | null;
  totalAllocation: number;
  totalUploaded: number;
  dailyLeads: DailyLeadCount[];
  campaignDateRange: string;
};

const STATUS_META: Record<
  ReturnType<typeof computeCampaignAverageAnalysis>["status"],
  { color: string; label: string; icon: ReactNode }
> = {
  completed: { color: "success", label: "Completed", icon: <CheckCircleOutlined /> },
  on_track: { color: "processing", label: "On track", icon: <RocketOutlined /> },
  behind: { color: "warning", label: "Behind schedule", icon: <WarningOutlined /> },
  overdue: { color: "error", label: "Overdue", icon: <ClockCircleOutlined /> },
  not_started: { color: "default", label: "Not started", icon: <CalendarOutlined /> },
  no_allocation: { color: "default", label: "No allocation set", icon: <FundOutlined /> },
};

function StatCard({
  title,
  value,
  sub,
  icon,
  color,
  bg,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <Card size="small" bordered style={{ borderRadius: 10, height: "100%" }} styles={{ body: { padding: "14px 16px" } }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {title}
          </Text>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, lineHeight: 1.15 }}>{value}</div>
          {sub ? (
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
              {sub}
            </Text>
          ) : null}
        </div>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: bg,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 17,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

export default function CampaignAverageAnalysisTab({
  startDate,
  endDate,
  totalAllocation,
  totalUploaded,
  dailyLeads,
  campaignDateRange,
}: Props) {
  const analysis = useMemo(
    () =>
      computeCampaignAverageAnalysis({
        startDate,
        endDate,
        totalAllocation,
        totalUploaded,
        dailyLeads,
      }),
    [startDate, endDate, totalAllocation, totalUploaded, dailyLeads]
  );

  const statusMeta = STATUS_META[analysis.status];
  const predictedLabel = analysis.predictedCompletionDate
    ? dayjs(analysis.predictedCompletionDate).format("MMM D, YYYY")
    : "—";

  const recentTrend = analysis.uploadTrend;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card size="small" bordered style={{ borderRadius: 10, background: "#fafafa" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Campaign progress prediction based on daily uploads vs allocation. Period:{" "}
              <Text strong>{campaignDateRange}</Text>
            </Text>
          </div>
          <Tag color={statusMeta.color} icon={statusMeta.icon} style={{ margin: 0 }}>
            {statusMeta.label}
          </Tag>
        </div>
      </Card>

      {analysis.status === "behind" && (
        <Alert
          type="warning"
          showIcon
          message="Upload pace is behind the campaign end date"
          description={
            analysis.requiredUploadPerDay != null
              ? `Increase to about ${analysis.requiredUploadPerDay} leads/day to finish by ${dayjs(analysis.endDate).format("MMM D, YYYY")}. Current average: ${analysis.avgUploadPerDay}/day.`
              : undefined
          }
        />
      )}
      {analysis.status === "overdue" && analysis.remainingLeads > 0 && (
        <Alert
          type="error"
          showIcon
          message="Campaign end date has passed with leads still remaining"
          description={`${analysis.remainingLeads} lead${analysis.remainingLeads !== 1 ? "s" : ""} still needed from ${analysis.totalAllocation} allocated.`}
        />
      )}

      <Card size="small" bordered style={{ borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <Text strong>Campaign progress</Text>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {analysis.totalUploaded} / {analysis.totalAllocation} leads
          </Text>
        </div>
        <Progress
          percent={analysis.progressPercent}
          strokeColor={analysis.status === "completed" ? "#52c41a" : "#4f46e5"}
          status={analysis.status === "overdue" ? "exception" : analysis.status === "behind" ? "active" : undefined}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total uploaded"
            value={analysis.totalUploaded}
            sub={`of ${analysis.totalAllocation} allocated`}
            icon={<UploadOutlined />}
            color="#4f46e5"
            bg="#eef2ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Remaining leads"
            value={analysis.remainingLeads}
            icon={<FundOutlined />}
            color="#f59e0b"
            bg="#fff7e6"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Days remaining"
            value={analysis.daysRemaining}
            sub={`${analysis.elapsedDays} of ${analysis.totalCampaignDays} days elapsed`}
            icon={<CalendarOutlined />}
            color="#722ed1"
            bg="#f9f0ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Uploaded today"
            value={analysis.todayUploads}
            sub={dayjs().format("MMM D, YYYY")}
            icon={<ThunderboltOutlined />}
            color="#52c41a"
            bg="#f6ffed"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Avg upload / day"
            value={analysis.avgUploadPerDay}
            sub="Based on elapsed campaign days"
            icon={<RocketOutlined />}
            color="#4f46e5"
            bg="#eef2ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Required upload / day"
            value={analysis.requiredUploadPerDay ?? "—"}
            sub={
              analysis.daysRemaining > 0
                ? "To finish on time from today"
                : analysis.remainingLeads === 0
                  ? "Target met"
                  : "End date passed"
            }
            icon={<WarningOutlined />}
            color="#f59e0b"
            bg="#fff2e8"
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="Predicted completion"
            value={predictedLabel}
            sub={
              analysis.endDate
                ? `Planned end: ${dayjs(analysis.endDate).format("MMM D, YYYY")}`
                : undefined
            }
            icon={<ClockCircleOutlined />}
            color="#13c2c2"
            bg="#e6fffb"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Daily upload trend" size="small" bordered style={{ borderRadius: 10 }}>
            {recentTrend.length === 0 ? (
              <Text type="secondary">No campaign dates set.</Text>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={recentTrend} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                  <RTooltip formatter={(v: number) => [`${v} leads`, "Uploaded"]} />
                  <Bar dataKey="count" name="Leads" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Expected vs actual progress" size="small" bordered style={{ borderRadius: 10 }}>
            {analysis.chartSeries.length === 0 ? (
              <Text type="secondary">Set campaign dates to see progress comparison.</Text>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={analysis.chartSeries} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={40} />
                  <RTooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="cumulativeExpected"
                    name="Expected (plan)"
                    stroke="#d1d5db"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeActual"
                    name="Actual (uploaded)"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Cumulative progress detail" size="small" bordered style={{ borderRadius: 10 }}>
        {analysis.chartSeries.length === 0 ? (
          <Text type="secondary">No timeline data available.</Text>
        ) : (
          <>
            <Title level={5} style={{ marginTop: 0, marginBottom: 12, fontWeight: 600 }}>
              Upload pace summary
            </Title>
            <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 16 }}>
              Linear expected pace spreads {analysis.totalAllocation} leads evenly across{" "}
              {analysis.totalCampaignDays} campaign days. Actual line uses cumulative daily uploads;
              prediction uses your average rate of {analysis.avgUploadPerDay} leads/day.
            </Text>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={analysis.chartSeries} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={40} />
                <RTooltip />
                <Line
                  type="monotone"
                  dataKey="dailyUpload"
                  name="Daily upload"
                  stroke="#722ed1"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>
    </div>
  );
}
