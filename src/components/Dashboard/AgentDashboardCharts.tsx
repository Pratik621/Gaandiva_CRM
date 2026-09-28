"use client";

import { Card, Empty, Progress, Row, Col, Tag, Typography } from "antd";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ThunderboltOutlined, ClockCircleOutlined } from "@ant-design/icons";
import type {
  AgentCampaignLeadBar,
  AgentCompletionPrediction,
  AgentLeadTrendDay,
} from "@/lib/agent-dashboard-metrics";
import dayjs from "dayjs";

const { Text } = Typography;

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
  height: "100%",
};

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #f0f0f0",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 22px 16px" } }}>
      <Text strong style={{ fontSize: 16, display: "block" }}>
        {title}
      </Text>
      {subtitle ? (
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
          {subtitle}
        </Text>
      ) : null}
      <div style={{ marginTop: 16 }}>{children}</div>
    </Card>
  );
}

function ChartEmpty({ description }: { description: string }) {
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} style={{ margin: "48px 0" }} />
  );
}

function fmtDate(d: string | null): string {
  return d ? dayjs(d).format("DD MMM YYYY") : "—";
}

/** Grouped bars: Pending · Qualified · Disqualified per day (last 14 days) */
export function AgentLeadTrendChart({ data }: { data: AgentLeadTrendDay[] }) {
  const hasData = data.some((d) => d.total > 0);

  return (
    <ChartCard
      title="My Lead Trend"
      subtitle="Your uploads — Pending · Qualified · Disqualified (last 14 days)"
    >
      {!hasData ? (
        <ChartEmpty description="No uploads in the last 14 days" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="pending" name="Pending" stackId="qa" fill="#f59e0b" radius={[0, 0, 0, 0]} />
            <Bar dataKey="qualified" name="Qualified" stackId="qa" fill="#52c41a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="disqualified" name="Disqualified" stackId="qa" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/** Horizontal bar: your uploads per assigned campaign */
export function AgentCampaignLeadsChart({ data }: { data: AgentCampaignLeadBar[] }) {
  return (
    <ChartCard title="Campaign Leads" subtitle="Leads you uploaded on each assigned campaign">
      {data.length === 0 ? (
        <ChartEmpty description="No uploads on assigned campaigns yet" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={112}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number, name, item) => {
                const row = item?.payload as AgentCampaignLeadBar | undefined;
                if (name === "uploads" && row) {
                  return [
                    `${v} total (${row.qualified} qualified, ${row.pending} pending)`,
                    "Your uploads",
                  ];
                }
                return [v, name];
              }}
            />
            <Bar dataKey="uploads" name="Your uploads" fill="#4f46e5" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function MetricTile({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "#fafafa",
        borderRadius: 10,
        border: "1px solid #f0f0f0",
        height: "100%",
      }}
    >
      <Text type="secondary" style={{ fontSize: 10, display: "block", lineHeight: 1.3 }}>
        {label}
      </Text>
      <Text strong style={{ fontSize: 14, display: "block", marginTop: 4, color: valueColor ?? "#1f1f1f" }}>
        {value}
      </Text>
      {sub ? (
        <Text type="secondary" style={{ fontSize: 10, display: "block", marginTop: 2 }}>
          {sub}
        </Text>
      ) : null}
    </div>
  );
}

function PredictionCard({ c }: { c: AgentCompletionPrediction }) {
  const borderColor = c.is_complete
    ? "#52c41a"
    : c.is_overdue
    ? "#ef4444"
    : c.is_nearing
    ? "#f59e0b"
    : "#4f46e5";

  return (
    <Card
      style={{
        borderRadius: 14,
        border: "1px solid #f0f0f0",
        borderLeft: `4px solid ${borderColor}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        height: "100%",
      }}
      styles={{ body: { padding: "16px 18px" } }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 14, display: "block" }}>
            {c.campaign_name}
          </Text>
          {c.campaign_code ? (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {c.campaign_code}
            </Text>
          ) : null}
          <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
            {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
          </Text>
        </div>
        <Tag
          color={
            c.is_complete ? "success" : c.is_overdue ? "error" : c.is_nearing ? "warning" : "processing"
          }
          style={{ margin: 0, borderRadius: 20, fontSize: 11, flexShrink: 0 }}
        >
          {c.is_complete ? "Complete" : c.is_overdue ? "Overdue" : c.is_nearing ? "Due Soon" : "On Track"}
        </Tag>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Qualified progress (all agents)
          </Text>
          <Text strong style={{ fontSize: 12, color: borderColor }}>
            {c.campaign_qualified.toLocaleString()} / {c.total_allocation.toLocaleString()}
          </Text>
        </div>
        <Progress percent={c.progress_pct} size="small" strokeColor={borderColor} showInfo={false} />
      </div>

      <Row gutter={[8, 8]}>
        <Col span={12}>
          <MetricTile
            label="Team qualified"
            value={c.campaign_qualified.toLocaleString()}
            sub={`Target ${c.total_allocation.toLocaleString()}`}
            valueColor="#52c41a"
          />
        </Col>
        <Col span={12}>
          <MetricTile
            label="Total uploads"
            value={c.campaign_total_uploaded.toLocaleString()}
            sub="All agents on campaign"
          />
        </Col>
        <Col span={12}>
          <MetricTile
            label="Your uploads"
            value={c.agent_uploaded.toLocaleString()}
            sub={`${c.agent_qualified.toLocaleString()} qualified by you`}
            valueColor="#4f46e5"
          />
        </Col>
        <Col span={12}>
          <MetricTile
            label="Days left"
            value={c.days_left !== null ? (c.is_overdue ? "Overdue" : `${c.days_left} days`) : "—"}
            sub={c.is_overdue ? "Past end date" : undefined}
            valueColor={c.is_overdue ? "#ef4444" : undefined}
          />
        </Col>
      </Row>

      {c.required_per_day !== null && !c.is_complete && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: "#f0f5ff",
            borderRadius: 8,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <ThunderboltOutlined style={{ color: "#4f46e5", fontSize: 14, marginTop: 2 }} />
          <Text style={{ fontSize: 12, color: "#4f46e5", fontWeight: 600, lineHeight: 1.5 }}>
            Campaign needs ~{c.required_per_day} more qualified leads/day ({c.remaining_qualified.toLocaleString()}{" "}
            qualified remaining) by {fmtDate(c.end_date)}
          </Text>
        </div>
      )}
    </Card>
  );
}

export function AgentCompletionPredictions({
  predictions,
}: {
  predictions: AgentCompletionPrediction[];
}) {
  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 16,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        border: "1px solid #f0f0f0",
      }}
      styles={{ body: { padding: "20px 22px" } }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <ClockCircleOutlined style={{ color: "#4f46e5", fontSize: 18 }} />
        <div>
          <Text strong style={{ fontSize: 16, display: "block" }}>
            Campaign Completion Predictions
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Qualified leads vs allocation (shared team) — your uploads shown separately
          </Text>
        </div>
      </div>

      {predictions.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No active assigned campaigns with allocation targets"
          style={{ margin: "24px 0" }}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {predictions.map((c) => (
            <Col xs={24} md={12} xl={8} key={c.id}>
              <PredictionCard c={c} />
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
}
