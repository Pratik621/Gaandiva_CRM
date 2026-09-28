"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuth } from "@/context/AuthContext";
import OpsPerformanceReportDashboard from "@/components/MIS/OpsPerformanceReportDashboard";

export default function TLOpsReportsPage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const canView = hasRole("operations_manager") || hasRole("admin");

  useEffect(() => {
    if (isInitialized && !canView) {
      router.replace("/tl/dashboard");
    }
  }, [isInitialized, canView, router]);

  if (!isInitialized || !canView) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return <OpsPerformanceReportDashboard />;
}
