"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";

export default function QATLHeader() {
  return (
    <CrmHeader
      roleLabel="QA TL"
      fallbackName="QA TL User"
      profilePath="/qatl/profile"
      showSettings={false}
      search={<GlobalSearch />}
    />
  );
}
