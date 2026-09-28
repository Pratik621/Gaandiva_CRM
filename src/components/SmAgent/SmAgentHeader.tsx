"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";

export default function SmAgentHeader() {
  return (
    <CrmHeader
      roleLabel="Simplified Agent"
      fallbackName="Agent"
      search={<GlobalSearch />}
      showSettings={false}
    />
  );
}
