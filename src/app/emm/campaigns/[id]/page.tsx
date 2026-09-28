"use client";

import { QaCampaignDetailView } from "@/components/QA/QaCampaignDetailView";
import { EMM_GUARD_ROLES } from "@/lib/auth/emm-access";

export default function EmmCampaignDetailPage() {
  return (
    <QaCampaignDetailView
      basePath="/emm/campaigns"
      guardRoles={[...EMM_GUARD_ROLES]}
      assignAgentsApiPrefix="/api/emm/campaigns"
    />
  );
}
