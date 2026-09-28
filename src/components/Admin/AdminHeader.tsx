"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";

export default function AdminHeader() {
  return (
    <CrmHeader
      roleLabel="Admin"
      fallbackName="Admin"
      profilePath="/admin/profile"
      search={<GlobalSearch />}
    />
  );
}
