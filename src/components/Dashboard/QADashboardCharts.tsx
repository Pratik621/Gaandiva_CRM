"use client";

import { Card, Empty, Typography } from "antd";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  QaActivityDay,
  QaCampaignStatusBar,
  QaPendingCampaignBar,
  QaPipelineSlice,
} from "@/lib/qa-dashboard-metrics";

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
    <Card
      bordered={false}
      style={cardStyle}
      styles={{ body: { padding: "20px 22px 16px" } }}
    >
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

/** Donut: Pending vs Qualified vs Disqualified */
export function QAPipelineChart({ data }: { data: QaPipelineSlice[] }) {
  const slices = data.length > 0 ? data : [{ name: "No leads", value: 1, color: "#d1d5db" }];
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <ChartCard title="QA Pipeline" subtitle="Pending, qualified, and disqualified leads">
      {total === 0 ? (
        <ChartEmpty description="No scored leads yet" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={68}
              outerRadius={98}
              paddingAngle={2}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {slices.map((entry, i) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString(), "Leads"]} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/** Bar: campaigns by status */
export function QACampaignStatusChart({ data }: { data: QaCampaignStatusBar[] }) {
  return (
    <ChartCard title="Campaigns by Status" subtitle="How many campaigns are in each state">
      {data.length === 0 ? (
        <ChartEmpty description="No campaigns" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Campaigns"]} />
            <Bar dataKey="count" name="Campaigns" radius={[8, 8, 0, 0]}>
              {data.map((row) => (
                <Cell key={row.status} fill={row.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/** Horizontal bar: top campaigns with pending QA */
export function QATopPendingCampaignsChart({ data }: { data: QaPendingCampaignBar[] }) {
  return (
    <ChartCard title="Top Pending QA" subtitle="Campaigns with the most unaudited leads">
      {data.length === 0 ? (
        <ChartEmpty description="No pending QA — all caught up" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={108}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number, _n, item) => {
                const row = item?.payload as QaPendingCampaignBar | undefined;
                return [`${v} pending (${row?.total ?? 0} total)`, "Pending"];
              }}
            />
            <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/** Grouped bar: uploads vs audits — last 14 days */
export function QAUploadAuditTrendChart({ data }: { data: QaActivityDay[] }) {
  const hasData = data.some((d) => d.uploaded > 0 || d.audited > 0);

  return (
    <ChartCard title="Uploads vs Audits" subtitle="Last 14 days — uploads by created date, audits by audit date">
      {!hasData ? (
        <ChartEmpty description="No activity in the last 14 days" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="uploaded" name="Uploaded" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            <Bar dataKey="audited" name="Audited" fill="#52c41a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
