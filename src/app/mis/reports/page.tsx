"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import { MIS_OPS_REPORT_ROLES } from "@/lib/mis/ops-performance-access";
import OpsPerformanceReportDashboard from "@/components/MIS/OpsPerformanceReportDashboard";

export default function MISReportsPage() {
  const { status } = useRoleGuard([...MIS_OPS_REPORT_ROLES]);

  if (status !== "authorized") {
    return null;
  }

  return <OpsPerformanceReportDashboard />;
}
