"use client";

import SalesLayout from "@/components/Sales/SalesLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Spin, Typography } from "antd";

export default function SalesRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useRoleGuard(["sales", "sales_manager", "admin"]);

  // Keep SalesLayout (sidebar + header) always mounted — same pattern as every other
  // role layout — so a background loading state never unmounts and remounts the shell.
  // Only the content area shows a spinner while auth is resolving.
  return (
    <SalesLayout>
      {status === "loading" ? (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
          <Spin size="large" />
          <Typography.Text type="secondary">Loading...</Typography.Text>
        </div>
      ) : status === "redirecting" ? (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
          <Spin size="large" />
          <Typography.Text type="secondary">Redirecting...</Typography.Text>
        </div>
      ) : (
        children
      )}
    </SalesLayout>
  );
}
