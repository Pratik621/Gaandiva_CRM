"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import { EMM_GUARD_ROLES } from "@/lib/auth/emm-access";
import LeadFinderPage from "@/components/Admin/LeadFinder/LeadFinderPage";

export default function EmmLeadFinderPage() {
  const { status } = useRoleGuard([...EMM_GUARD_ROLES]);
  if (status !== "authorized") {
    return null;
  }
  return <LeadFinderPage />;
}
