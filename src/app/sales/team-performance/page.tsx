"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Typography, Spin } from "antd";
import { useAuth } from "@/context/AuthContext";
import TeamPerformanceDashboard from "@/components/TL/TeamPerformanceDashboard";

const { Text } = Typography;

export default function SalesTeamPerformancePage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const canView =
    hasRole("sales_manager") || hasRole("admin") || hasRole("operations_manager");

  useEffect(() => {
    if (isInitialized && !canView) {
      router.replace("/sales/dashboard");
    }
  }, [isInitialized, canView, router]);

  if (!isInitialized || !canView) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Team Performance</h1>
        <Text type="secondary" style={{ fontSize: 14 }}>
          Organization-wide analytics — leads uploaded, campaign progress, and agent rankings.
        </Text>
      </div>
      <TeamPerformanceDashboard />
    </>
  );
}
