"use client";

import QALayout from "@/components/QA/QALayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Spin } from "antd";

export default function QARootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useRoleGuard(["qa", "admin"]);

  return (
    <QALayout>
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
    </QALayout>
  );
}
