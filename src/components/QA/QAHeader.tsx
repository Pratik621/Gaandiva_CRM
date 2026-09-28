"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";

export default function QAHeader() {
  return (
    <CrmHeader
      roleLabel="QA"
      fallbackName="QA"
      profilePath="/qa/profile"
      search={<GlobalSearch />}
    />
  );
}
