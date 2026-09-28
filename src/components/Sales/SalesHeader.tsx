"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "./GlobalSearch";
import { useAuth } from "@/context/AuthContext";

function getRoleDisplayName(roles: { role_name: string }[]): string {
  const normalized = (name: string) => name.toLowerCase().replace(/\s+/g, "_");
  for (const r of roles) {
    const n = normalized(r.role_name);
    if (n === "sales_manager") return "Sales Manager";
    if (n === "admin") return "Admin";
    if (n === "sales") return "Sales";
  }
  return "Sales";
}

export default function SalesHeader() {
  const { roles } = useAuth();

  return (
    <CrmHeader
      roleLabel={getRoleDisplayName(roles)}
      fallbackName="Sales"
      profilePath="/sales/profile"
      search={<GlobalSearch />}
    />
  );
}
