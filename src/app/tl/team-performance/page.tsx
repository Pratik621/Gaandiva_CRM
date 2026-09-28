"use client";

import { Typography } from "antd";
import TeamPerformanceDashboard from "@/components/TL/TeamPerformanceDashboard";

const { Text } = Typography;

export default function TeamPerformancePage() {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Team Performance</h1>
        <Text type="secondary" style={{ fontSize: 14 }}>
          Role-based analytics — leads uploaded, campaign progress, and agent rankings.
        </Text>
      </div>
      <TeamPerformanceDashboard />
    </>
  );
}
