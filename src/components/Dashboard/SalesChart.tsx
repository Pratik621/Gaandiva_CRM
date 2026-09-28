"use client";

import { Card, Typography } from "antd";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const { Text } = Typography;

const data = [
  { month: "Jan", revenue: 4200, deals: 12 },
  { month: "Feb", revenue: 5800, deals: 18 },
  { month: "Mar", revenue: 5100, deals: 15 },
  { month: "Apr", revenue: 7200, deals: 22 },
  { month: "May", revenue: 8900, deals: 28 },
  { month: "Jun", revenue: 12400, deals: 35 },
];

export default function SalesChart() {
  return (
    <Card
      title={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text strong style={{ fontSize: 16 }}>Revenue Overview</Text>
          <Text type="secondary" style={{ fontSize: 13 }}>Last 6 months</Text>
        </div>
      }
      bordered={false}
      style={{
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
          <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
            contentStyle={{ borderRadius: 8 }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#4f46e5"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorRevenue)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
