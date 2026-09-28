"use client";

import React from "react";
import { Card } from "antd";
import { renderExpandableOverviewValue } from "@/components/ExpandableText";

export type CampaignDetailRow = {
  label: string;
  value: React.ReactNode;
};

const overviewRowStyle = {
  display: "grid",
  gridTemplateColumns: "160px 1fr",
  gap: 16,
  padding: "10px 0",
  borderBottom: "1px solid #f0f0f0",
} as const;

const overviewLabelStyle = { fontSize: 13, color: "#6b7280", fontWeight: 500 } as const;
const overviewValueStyle = {
  fontSize: 14,
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
};

const cardStyle = {
  marginBottom: 24,
  borderRadius: 8,
  border: "1px solid #f0f0f0",
  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
};

function DetailRow({ label, value }: CampaignDetailRow) {
  return (
    <div style={overviewRowStyle}>
      <span style={overviewLabelStyle}>{label}</span>
      <span style={overviewValueStyle}>
        {renderExpandableOverviewValue(value ?? "—", overviewValueStyle)}
      </span>
    </div>
  );
}

export function CampaignDetailsCard({ rows }: { rows: CampaignDetailRow[] }) {
  return (
    <Card title="Campaign details" style={cardStyle} styles={{ body: { padding: "20px 24px" } }}>
      {rows.map((row) => (
        <DetailRow key={row.label} label={row.label} value={row.value} />
      ))}
    </Card>
  );
}
