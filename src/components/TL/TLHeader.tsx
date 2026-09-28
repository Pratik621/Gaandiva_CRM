"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";
import { useAuth } from "@/context/AuthContext";
import { getTLAreaRoleDisplayName } from "@/lib/auth/tl-access";

export default function TLHeader() {
  const { roles } = useAuth();
  const roleLabel = getTLAreaRoleDisplayName(roles);

  return (
    <CrmHeader
      roleLabel={roleLabel}
      fallbackName="User"
      profilePath="/tl/profile"
      search={<GlobalSearch />}
    />
  );
}
