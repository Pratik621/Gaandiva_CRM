"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Typography, Input, Pagination, Button } from "antd";
import { SearchOutlined, ArrowRightOutlined } from "@ant-design/icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { QatlCampaignPerformanceRow } from "@/lib/qatl/dashboard-stats";

const { Text } = Typography;

const PAGE_SIZE = 5;
const NAME_TRUNCATE = 16;
const NAME_COLUMN_WIDTH = 130;

function truncateName(name: string, max = NAME_TRUNCATE) {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

type TickProps = { x?: number; y?: number; payload?: { value?: string } };

function CampaignNameTick({ x = 0, y = 0, payload }: TickProps) {
  const full = String(payload?.value ?? "");
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text
        x={-(NAME_COLUMN_WIDTH - 6)}
        y={0}
        dy={4}
        textAnchor="start"
        fontSize={12}
        fill="#374151"
      >
        {truncateName(full)}
      </text>
    </g>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: { payload: QatlCampaignPerformanceRow }[];
};

function CampaignBarTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const pct = row.totalLeads > 0 ? Math.round((row.qualifiedLeads / row.totalLeads) * 100) : 0;
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        border: "1px solid #f0f0f0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        padding: "10px 12px",
        fontSize: 12,
        minWidth: 170,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{row.name}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#6b7280" }}>Total Leads</span>
        <strong>{row.totalLeads.toLocaleString()}</strong>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#6b7280" }}>Qualified Leads</span>
        <strong>{row.qualifiedLeads.toLocaleString()}</strong>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#6b7280" }}>Qualified %</span>
        <strong>{pct}%</strong>
      </div>
    </div>
  );
}

const EMPTY_ROW: QatlCampaignPerformanceRow = {
  id: "empty",
  name: "—",
  campaign_code: null,
  totalAllocation: null,
  totalLeads: 0,
  qualifiedLeads: 0,
  disqualifiedLeads: 0,
  pendingAudit: 0,
  delivered: 0,
  rejected: 0,
  pendingDelivery: 0,
};

function CampaignPerformanceChart({ data }: { data: QatlCampaignPerformanceRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () => [...data].sort((a, b) => b.totalLeads - a.totalLeads),
    [data]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((r) => r.name.toLowerCase().includes(term));
  }, [sorted, search]);

  // Reset to page 1 whenever the search term narrows/widens the result set.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pageData = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const chartData = pageData.length ? pageData : [EMPTY_ROW];

  const rangeStart = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, total);
  const caption =
    !search.trim() && safePage === 1
      ? `Top ${Math.min(PAGE_SIZE, total)} campaigns by total leads`
      : `Showing ${rangeStart}-${rangeEnd} of ${total} campaigns`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {caption}
      </Text>
      <Input
        allowClear
        placeholder="Search campaign..."
        prefix={<SearchOutlined style={{ color: "#9ca3af" }} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginTop: 8, marginBottom: 12 }}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 70, left: 8, bottom: 5 }}
            barCategoryGap={18}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" stroke="#6b7280" fontSize={11} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={NAME_COLUMN_WIDTH}
              tick={<CampaignNameTick />}
              interval={0}
            />
            <RechartsTooltip
              content={<CampaignBarTooltip />}
              cursor={{ fill: "rgba(79,70,229,0.04)" }}
            />
            <Bar
              dataKey="totalLeads"
              fill="#4f46e5"
              radius={[0, 3, 3, 0]}
              name="Total Leads"
              barSize={12}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="totalLeads"
                position="right"
                offset={8}
                style={{ fontSize: 12, fontWeight: 700, fill: "#111827" }}
              />
              <LabelList
                dataKey="qualifiedLeads"
                position="right"
                offset={44}
                formatter={(v: number) => `(${v} qual.)`}
                style={{ fontSize: 10, fontWeight: 500, fill: "#9ca3af" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Pagination
          simple
          size="small"
          current={safePage}
          pageSize={PAGE_SIZE}
          total={total}
          onChange={(p) => setPage(p)}
          hideOnSinglePage
        />
        <Button
          type="link"
          size="small"
          onClick={() => router.push("/qatl/campaigns")}
          style={{ paddingRight: 0 }}
        >
          View all campaigns <ArrowRightOutlined style={{ fontSize: 11 }} />
        </Button>
      </div>
    </div>
  );
}

export default memo(CampaignPerformanceChart);
