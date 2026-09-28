"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import { MISTL_OPS_REPORT_ROLES } from "@/lib/mistl/ops-performance-access";
import OpsPerformanceReportDashboard from "@/components/MIS_TL/OpsPerformanceReportDashboard";

export default function MISTLReportsPage() {
  const { status } = useRoleGuard([...MISTL_OPS_REPORT_ROLES]);

  if (status !== "authorized") {
    return null;
  }

  return <OpsPerformanceReportDashboard />;
}
