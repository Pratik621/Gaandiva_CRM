"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";

export default function MarketingHeader() {
  return (
    <CrmHeader
      roleLabel="Marketing"
      fallbackName="Marketing"
      search={<GlobalSearch />}
      showSettings={false}
    />
  );
}
