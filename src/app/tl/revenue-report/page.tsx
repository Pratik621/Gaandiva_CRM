"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Typography, Spin } from "antd";
import { useAuth } from "@/context/AuthContext";
import RevenueReportDashboard from "@/components/TL/RevenueReportDashboard";

const { Text } = Typography;

export default function RevenueReportPage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const isOm = hasRole("operations_manager");
  const isAdmin = hasRole("admin");
  const isSalesManager = hasRole("sales_manager");
  const canViewRevenue = isOm || isAdmin || isSalesManager;

  useEffect(() => {
    if (isInitialized && !canViewRevenue) {
      router.replace("/tl/dashboard");
    }
  }, [isInitialized, canViewRevenue, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!canViewRevenue) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" tip="Redirecting..." />
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Revenue Report</h1>
        <Text type="secondary" style={{ fontSize: 14 }}>
          Campaign revenue, allocation, and performance across your organization.
        </Text>
      </div>
      <RevenueReportDashboard />
    </>
  );
}
