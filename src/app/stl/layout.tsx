"use client";

import STLLayout from "@/components/STL/STLLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { getSTLGuardRoles } from "@/lib/auth/stl-access";
import { Spin } from "antd";

export default function STLRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useRoleGuard(getSTLGuardRoles());

  return (
    <STLLayout>
      {status === "loading" ? (
        <div className="min-h-[60vh] flex items-center justify-center">
          <Spin size="large" />
        </div>
      ) : status === "redirecting" ? (
        <div className="min-h-[60vh] flex items-center justify-center">
          <Spin size="large" tip="Redirecting..." />
        </div>
      ) : (
        children
      )}
    </STLLayout>
  );
}
