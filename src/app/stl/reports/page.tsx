"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuth } from "@/context/AuthContext";
import OpsPerformanceReportDashboard from "@/components/MIS/OpsPerformanceReportDashboard";

export default function STLOpsReportsPage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const isOrgWide = hasRole("operations_manager") || hasRole("admin");
  const canView = isOrgWide || hasRole("stl");

  useEffect(() => {
    if (isInitialized && !canView) {
      router.replace("/stl/dashboard");
    }
  }, [isInitialized, canView, router]);

  if (!isInitialized || !canView) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (isOrgWide) {
    return <OpsPerformanceReportDashboard />;
  }

  return (
    <OpsPerformanceReportDashboard
      apiBasePath="/api/stl/reports/ops-performance"
      singleTlFilter
    />
  );
}
