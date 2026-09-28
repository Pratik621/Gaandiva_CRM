"use client";

import TLLayout from "@/components/TL/TLLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { getOMGuardRoles } from "@/lib/auth/tl-access";
import { Spin } from "antd";

export default function OMRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useRoleGuard(getOMGuardRoles());

  return (
    <TLLayout>
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
    </TLLayout>
  );
}
