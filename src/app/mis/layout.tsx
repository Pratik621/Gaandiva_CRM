"use client";

import MISLayout from "@/components/MIS/MISLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Spin } from "antd";

export default function MISRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useRoleGuard(["mis", "admin"]);

  return (
    <MISLayout>
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
    </MISLayout>
  );
}


