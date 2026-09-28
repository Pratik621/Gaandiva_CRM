"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import LeadFinderPage from "@/components/Admin/LeadFinder/LeadFinderPage";

export default function AdminLeadFinderPage() {
  const { status } = useRoleGuard(["admin"]);
  if (status !== "authorized") {
    return null;
  }
  return <LeadFinderPage />;
}
