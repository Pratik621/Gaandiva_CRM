"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import LeadFinderPage from "@/components/Admin/LeadFinder/LeadFinderPage";

export default function StlLeadFinderPage() {
  const { status } = useRoleGuard(["admin", "operations_manager", "stl", "senior_team_leader"]);
  if (status !== "authorized") {
    return null;
  }
  return <LeadFinderPage />;
}
