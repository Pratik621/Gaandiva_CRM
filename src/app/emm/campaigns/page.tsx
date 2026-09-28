"use client";

import { QaCampaignsView } from "@/components/QA/QaCampaignsView";
import { EMM_GUARD_ROLES } from "@/lib/auth/emm-access";

export default function EmmCampaignsPage() {
  return (
    <QaCampaignsView
      basePath="/emm/campaigns"
      guardRoles={[...EMM_GUARD_ROLES]}
      queryKeyPrefix={["emm", "campaigns"]}
      exportFilenamePrefix="emm-campaigns-export"
      showDeliveredColumn
    />
  );
}
