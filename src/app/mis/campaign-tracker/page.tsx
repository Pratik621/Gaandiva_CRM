"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import CampaignTrackerDashboard from "@/components/MIS/CampaignTrackerDashboard";

export default function MisCampaignTrackerPage() {
  const { status } = useRoleGuard(["mis", "admin"]);

  if (status !== "authorized") {
    return null;
  }

  return <CampaignTrackerDashboard />;
}
