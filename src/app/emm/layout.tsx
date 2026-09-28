"use client";

import EMMLayout from "@/components/EMM/EMMLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { EMM_GUARD_ROLES } from "@/lib/auth/emm-access";
import { Spin } from "antd";

export default function EMMRootLayout({ children }: { children: React.ReactNode }) {
  const { status } = useRoleGuard([...EMM_GUARD_ROLES]);

  return (
    <EMMLayout>
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
    </EMMLayout>
  );
}
