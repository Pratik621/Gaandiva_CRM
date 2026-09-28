"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import AuditLogsPage from "@/components/Admin/AuditLogsPage";

export default function AdminAuditLogsPage() {
  const { status } = useRoleGuard(["admin"]);
  if (status !== "authorized") {
    return null;
  }
  return <AuditLogsPage />;
}
