"use client";

import MarketingLayout from "@/components/Marketing/MarketingLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Spin } from "antd";

export default function MarketingRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useRoleGuard(["sm_marketing", "admin"]);

  return (
    <MarketingLayout>
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
    </MarketingLayout>
  );
}
