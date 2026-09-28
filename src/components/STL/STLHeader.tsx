"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";
import { useAuth } from "@/context/AuthContext";
import { getSTLAreaRoleDisplayName } from "@/lib/auth/stl-access";

export default function STLHeader() {
  const { roles } = useAuth();
  const roleLabel = getSTLAreaRoleDisplayName(roles);

  return (
    <CrmHeader
      roleLabel={roleLabel}
      fallbackName="User"
      profilePath="/stl/profile"
      search={<GlobalSearch />}
    />
  );
}
