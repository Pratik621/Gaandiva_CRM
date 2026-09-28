"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import { QATL_OPS_REPORT_ROLES } from "@/lib/qatl/ops-performance-access";
import OpsPerformanceReportDashboard from "@/components/QA_TL/OpsPerformanceReportDashboard";

export default function QATLReportsPage() {
  const { status } = useRoleGuard([...QATL_OPS_REPORT_ROLES]);

  if (status !== "authorized") {
    return null;
  }

  return <OpsPerformanceReportDashboard />;
}
