"use client";

import CrmHeader from "@/components/shared/CrmHeader";

export default function AdminSupportHeader() {
  return <CrmHeader roleLabel="Admin Support" fallbackName="Admin Support" search={null} settingsPath="/admin-support/settings" />;
}
