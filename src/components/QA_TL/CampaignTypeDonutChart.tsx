"use client";

import { memo, useMemo } from "react";
import { Typography } from "antd";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import type { QatlCampaignTypeSlice } from "@/lib/qatl/dashboard-stats";

const { Text } = Typography;

// Fixed so the legend scrolls internally instead of growing the card when
// there are many campaign types — keeps this card's height in lockstep with
// its row siblings (Campaign Performance / Daily Upload Count).
const LEGEND_HEIGHT = 230;

const PALETTE = [
  "#4f46e5",
  "#52c41a",
  "#f59e0b",
  "#722ed1",
  "#13c2c2",
  "#ef4444",
  "#6b7280",
  "#0ea5e9",
];

function formatTypeLabel(type: string) {
  return type
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type LegendEntry = {
  type: string;
  label: string;
  count: number;
  pct: number;
  color: string;
};

function CampaignTypeDonutChart({ slices }: { slices: QatlCampaignTypeSlice[] }) {
  const total = useMemo(() => slices.reduce((sum, s) => sum + s.count, 0), [slices]);

  const legendData = useMemo<LegendEntry[]>(() => {
    return [...slices]
      .sort((a, b) => b.count - a.count)
      .map((s, idx) => ({
        type: s.type || "Unspecified",
        label: formatTypeLabel(s.type || "Unspecified"),
        count: s.count,
        pct: total > 0 ? (s.count / total) * 100 : 0,
        color: PALETTE[idx % PALETTE.length],
      }));
  }, [slices, total]);

  const pieData = legendData.length
    ? legendData
    : [{ type: "none", label: "No data", count: 1, pct: 100, color: "#e5e7eb" }];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* flexWrap intentionally omitted (default nowrap) — donut and legend must
          always sit side by side. Wrapping would stack them and, combined with
          this card's fixed height, silently clip the legend out of view. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            position: "relative",
            flex: "0 0 200px",
            width: 200,
            height: "100%",
            minHeight: LEGEND_HEIGHT,
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={94}
                paddingAngle={2}
                dataKey="count"
                nameKey="label"
                stroke="none"
                isAnimationActive={false}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                formatter={(value: number, _name: string, ctx: { payload?: LegendEntry }) => [
                  `${value.toLocaleString()} (${(ctx?.payload?.pct ?? 0).toFixed(1)}%)`,
                  ctx?.payload?.label,
                ]}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #f0f0f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <Text strong style={{ fontSize: 22, lineHeight: 1.1 }}>
              {total.toLocaleString()}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total Leads
            </Text>
          </div>
        </div>

        <style>{`
          .qatl-legend-scroll::-webkit-scrollbar { width: 5px; }
          .qatl-legend-scroll::-webkit-scrollbar-track { background: transparent; }
          .qatl-legend-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }
          .qatl-legend-scroll:hover::-webkit-scrollbar-thumb { background: #d1d5db; }
        `}</style>
        <div
          className="qatl-legend-scroll"
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            height: LEGEND_HEIGHT,
            maxHeight: LEGEND_HEIGHT,
            overflowY: "auto",
            overflowX: "hidden",
            scrollbarWidth: "thin",
            paddingRight: 6,
          }}
        >
          {legendData.map((entry) => (
            <div key={entry.type} style={{ padding: "5px 4px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: entry.color,
                      flexShrink: 0,
                    }}
                  />
                  <Text
                    style={{ fontSize: 13, fontWeight: 500, color: "#1f1f1f" }}
                    ellipsis={{ tooltip: entry.label }}
                  >
                    {entry.label}
                  </Text>
                </div>
                <Text strong style={{ fontSize: 13, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {entry.count.toLocaleString()}
                </Text>
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", paddingLeft: 14 }}>
                {entry.pct.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(CampaignTypeDonutChart);
