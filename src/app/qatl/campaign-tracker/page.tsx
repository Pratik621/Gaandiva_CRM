"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import CampaignTrackerDashboard from "@/components/QA_TL/CampaignTrackerDashboard";

export default function QatlCampaignTrackerPage() {
  const { status } = useRoleGuard(["qa_tl", "admin"]);

  if (status !== "authorized") {
    return null;
  }

  return <CampaignTrackerDashboard />;
}
