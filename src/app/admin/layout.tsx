"use client";

import AdminLayout from "@/components/Admin/AdminLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Spin } from "antd";

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useRoleGuard(["admin"]);

  // Always show layout shell (sidebar + header) for responsive feel
  // Content area shows loading or dashboard based on auth state
  return (
    <AdminLayout>
      {status === "loading" ? (
        <div className="flex items-center justify-center" style={{ minHeight: 400 }}>
          <Spin size="large" tip="Loading..." />
        </div>
      ) : status === "redirecting" ? (
        <div className="flex items-center justify-center" style={{ minHeight: 400 }}>
          <Spin size="large" tip="Redirecting..." />
        </div>
      ) : (
        children
      )}
    </AdminLayout>
  );
}
