"use client";

import { Spin } from "antd";
import AdminSupportLayout from "@/components/AdminSupport/AdminSupportLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";

export default function AdminSupportRootLayout({ children }: { children: React.ReactNode }) {
  const { status } = useRoleGuard(["admin_support"]);
  return (
    <AdminSupportLayout>
      {status === "authorized" ? children : <div className="flex items-center justify-center" style={{ minHeight: 400 }}><Spin size="large" tip={status === "loading" ? "Loading..." : "Redirecting..."} /></div>}
    </AdminSupportLayout>
  );
}
