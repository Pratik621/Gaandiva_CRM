"use client";

import { useMemo, useState } from "react";
import { Card, Row, Col, Typography, Segmented, DatePicker, Button, Table, Space } from "antd";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import dayjs from "dayjs";
import {
  RiseOutlined,
  CalendarOutlined,
  FieldTimeOutlined,
  FundOutlined,
} from "@ant-design/icons";

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

type TrendRow = {
  date?: string;
  period: string;
  leadVolume: number;
};

type MetricsTabProps = {
  totalLeads: number;
  dailyLeads: { date: string; count: number }[];
  trends: {
    rangeStart: string;
    rangeEnd: string;
    daily: { date: string; leadVolume: number }[];
    weekly: { period: string; leadVolume: number }[];
    monthly: { period: string; leadVolume: number }[];
  } | null | undefined;
  campaignDateRange: string;
  onRangeChange: (from: string, to: string) => void;
  onRangeReset: () => void;
};

const BAR_COLORS = ["#4f46e5", "#6366f1", "#818cf8", "#a5b4fc"];

export default function CampaignLeadMetricsTab({
  totalLeads,
  dailyLeads,
  trends,
  campaignDateRange,
  onRangeChange,
  onRangeReset,
}: MetricsTabProps) {
  const [granularity, setGranularity] = useState<"daily" | "weekly" | "monthly">("daily");

  const summary = useMemo(() => {
    const todayKey = dayjs().format("YYYY-MM-DD");
    const weekStart = dayjs().subtract(6, "day").format("YYYY-MM-DD");
    const monthStart = dayjs().startOf("month").format("YYYY-MM-DD");

    let today = 0;
    let week = 0;
    let month = 0;
    for (const row of dailyLeads) {
      if (row.date === todayKey) today = row.count;
      if (row.date >= weekStart) week += row.count;
      if (row.date >= monthStart) month += row.count;
    }
    return { today, week, month };
  }, [dailyLeads]);

  const chartRows: TrendRow[] = useMemo(() => {
    if (!trends) return [];
    if (granularity === "daily") {
      return trends.daily.map((r) => ({
        date: r.date,
        period: dayjs(r.date).format("MMM D"),
        leadVolume: r.leadVolume,
      }));
    }
    if (granularity === "weekly") {
      return trends.weekly.map((r) => ({
        period: r.period.replace(" → ", " – "),
        leadVolume: r.leadVolume,
      }));
    }
    return trends.monthly.map((r) => ({
      period: r.period,
      leadVolume: r.leadVolume,
    }));
  }, [trends, granularity]);

  const tableRows = useMemo(() => {
    const total = chartRows.reduce((s, r) => s + r.leadVolume, 0) || 1;
    return [...chartRows]
      .map((r) => ({
        key: r.date ?? r.period,
        period: r.period,
        leads: r.leadVolume,
        share: Math.round((r.leadVolume / total) * 1000) / 10,
      }))
      .reverse();
  }, [chartRows]);

  const avgPerPeriod =
    chartRows.length > 0
      ? Math.round(
          (chartRows.reduce((s, r) => s + r.leadVolume, 0) / chartRows.length) * 10
        ) / 10
      : 0;

  const statCards = [
    {
      title: "Total leads",
      value: totalLeads,
      sub: "Delivered on this campaign",
      icon: <FundOutlined />,
      color: "#4f46e5",
      bg: "#eef2ff",
    },
    {
      title: "Today",
      value: summary.today,
      sub: dayjs().format("MMM D, YYYY"),
      icon: <CalendarOutlined />,
      color: "#52c41a",
      bg: "#f6ffed",
    },
    {
      title: "Last 7 days",
      value: summary.week,
      sub: "Rolling week",
      icon: <FieldTimeOutlined />,
      color: "#722ed1",
      bg: "#f9f0ff",
    },
    {
      title: "This month",
      value: summary.month,
      sub: dayjs().format("MMMM YYYY"),
      icon: <RiseOutlined />,
      color: "#f59e0b",
      bg: "#fff7e6",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card size="small" bordered style={{ borderRadius: 10, background: "#fafafa" }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Lead delivery metrics for this campaign — how many leads were ingested over time. Campaign
          period: <Text strong>{campaignDateRange}</Text>
        </Text>
      </Card>

      <Row gutter={[16, 16]}>
        {statCards.map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.title}>
            <Card
              size="small"
              bordered
              style={{ borderRadius: 10, height: "100%" }}
              styles={{ body: { padding: "16px 18px" } }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {card.title}
                  </Text>
                  <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, lineHeight: 1.1 }}>
                    {card.value}
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
                    {card.sub}
                  </Text>
                </div>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: card.bg,
                    color: card.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                  }}
                >
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title="Lead volume"
        size="small"
        bordered
        style={{ borderRadius: 10 }}
        extra={
          <Space wrap align="center">
            <Segmented
              options={[
                { label: "Daily", value: "daily" },
                { label: "Weekly", value: "weekly" },
                { label: "Monthly", value: "monthly" },
              ]}
              value={granularity}
              onChange={(v) => setGranularity(v as "daily" | "weekly" | "monthly")}
            />
            {trends ? (
              <>
                <RangePicker
                  value={[dayjs(trends.rangeStart), dayjs(trends.rangeEnd)]}
                  onChange={(vals) => {
                    if (!vals?.[0] || !vals?.[1]) return;
                    onRangeChange(vals[0].format("YYYY-MM-DD"), vals[1].format("YYYY-MM-DD"));
                  }}
                  allowClear={false}
                  format="MMM D, YYYY"
                />
                <Button type="link" size="small" onClick={onRangeReset}>
                  Reset range
                </Button>
              </>
            ) : null}
          </Space>
        }
      >
        {!trends || chartRows.length === 0 ? (
          <Text type="secondary">No lead metrics in the selected date range yet.</Text>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <Title level={5} style={{ margin: 0 }}>
                {granularity === "daily"
                  ? "Daily ingestions"
                  : granularity === "weekly"
                    ? "Weekly ingestions"
                    : "Monthly ingestions"}
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Avg per {granularity === "daily" ? "day" : granularity === "weekly" ? "week" : "month"}
                : <Text strong>{avgPerPeriod}</Text> leads
              </Text>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  interval={granularity === "daily" ? "preserveStartEnd" : 0}
                  angle={granularity === "daily" && chartRows.length > 14 ? -35 : 0}
                  textAnchor={granularity === "daily" && chartRows.length > 14 ? "end" : "middle"}
                  height={granularity === "daily" && chartRows.length > 14 ? 56 : 32}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                <RTooltip
                  formatter={(value: number) => [`${value} leads`, "Ingested"]}
                  labelFormatter={(label) => String(label)}
                />
                <Bar dataKey="leadVolume" name="Leads" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {chartRows.map((_, index) => (
                    <Cell key={`bar-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      <Card title="Breakdown" size="small" bordered style={{ borderRadius: 10 }}>
        <Table
          size="small"
          pagination={{ pageSize: 10, showTotal: (t) => `${t} periods` }}
          dataSource={tableRows}
          columns={[
            {
              title: granularity === "daily" ? "Date" : granularity === "weekly" ? "Week" : "Month",
              dataIndex: "period",
              key: "period",
            },
            {
              title: "Leads ingested",
              dataIndex: "leads",
              key: "leads",
              width: 140,
              align: "right" as const,
              render: (v: number) => <Text strong>{v}</Text>,
            },
            {
              title: "% of period total",
              dataIndex: "share",
              key: "share",
              width: 140,
              align: "right" as const,
              render: (v: number) => `${v}%`,
            },
          ]}
          locale={{ emptyText: "No data for this range" }}
        />
      </Card>
    </div>
  );
}
