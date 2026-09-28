"use client";

import { Card, Typography } from "antd";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const { Text } = Typography;

const pipelineData = [
  { stage: "Lead", count: 45, fill: "#6366f1" },
  { stage: "Qualified", count: 32, fill: "#2db7f5" },
  { stage: "Proposal", count: 28, fill: "#13c2c2" },
  { stage: "Negotiation", count: 18, fill: "#f59e0b" },
  { stage: "Closed", count: 12, fill: "#52c41a" },
];

export default function PipelineChart() {
  return (
    <Card
      title={<Text strong style={{ fontSize: 16 }}>Pipeline by Stage</Text>}
      bordered={false}
      style={{
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={pipelineData} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" stroke="#6b7280" fontSize={12} />
          <YAxis type="category" dataKey="stage" stroke="#6b7280" fontSize={12} width={80} />
          <Tooltip contentStyle={{ borderRadius: 8 }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
            {pipelineData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
