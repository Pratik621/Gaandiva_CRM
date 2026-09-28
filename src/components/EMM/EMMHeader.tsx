"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";

export default function EMMHeader() {
  return (
    <CrmHeader
      roleLabel="Email Marketing"
      fallbackName="Email Marketing"
      profilePath="/emm/profile"
      showSettings={false}
      search={<GlobalSearch />}
    />
  );
}
