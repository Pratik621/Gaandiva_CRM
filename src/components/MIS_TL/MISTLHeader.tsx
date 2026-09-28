"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";

export default function MISTLHeader() {
  return (
    <CrmHeader
      roleLabel="MIS"
      fallbackName="MIS TL User"
      profilePath="/mistl/profile"
      showSettings={false}
      search={<GlobalSearch />}
    />
  );
}
