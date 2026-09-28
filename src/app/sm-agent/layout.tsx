"use client";

import SmAgentLayout from "@/components/SmAgent/SmAgentLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Spin } from "antd";

export default function SmAgentRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useRoleGuard(["sm_agent", "admin"]);

  return (
    <SmAgentLayout>
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
    </SmAgentLayout>
  );
}
