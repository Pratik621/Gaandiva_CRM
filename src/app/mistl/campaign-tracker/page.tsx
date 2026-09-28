"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import CampaignTrackerDashboard from "@/components/MIS_TL/CampaignTrackerDashboard";

export default function MistlCampaignTrackerPage() {
  const { status } = useRoleGuard(["mis_tl", "admin"]);

  if (status !== "authorized") {
    return null;
  }

  return <CampaignTrackerDashboard />;
}
