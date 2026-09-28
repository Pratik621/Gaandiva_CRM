"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";

export default function MISHeader() {
  return (
    <CrmHeader
      roleLabel="MIS"
      fallbackName="MIS User"
      profilePath="/mis/profile"
      showSettings={false}
      search={<GlobalSearch />}
    />
  );
}
