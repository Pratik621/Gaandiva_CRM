"use client";

import { Spin, Card, Typography, Empty } from "antd";
import { useRoleGuard } from "@/hooks/useRoleGuard";

const { Title, Text } = Typography;

export default function SalesSettingsPage() {
  const { status } = useRoleGuard(["sales", "sales_manager", "admin"]);

  if (status === "loading" || status === "redirecting") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 4px" }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "#1f1f1f" }}>
          Settings
        </Title>
        <Text type="secondary" style={{ fontSize: 14, display: "block", marginTop: 6 }}>
          Manage your sales workspace preferences
        </Text>
      </div>
      <Card
        bordered={false}
        style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid #f0f0f0" }}
      >
        <Empty description="Settings coming soon" />
      </Card>
    </div>
  );
}
