"use client";

import TLLayout from "@/components/TL/TLLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { getTLGuardRoles } from "@/lib/auth/tl-access";
import { StatCardsRowSkeleton, TableSkeleton } from "@/components/Dashboard/DashboardSkeletons";
import DashboardGreeting from "@/components/Dashboard/DashboardGreeting";

export default function TLRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useRoleGuard(getTLGuardRoles());

  const fallback = (
    <div style={{ padding: "0 4px" }}>
      <DashboardGreeting />
      <StatCardsRowSkeleton />
      <TableSkeleton rows={5} />
    </div>
  );

  return (
    <TLLayout>
      {status === "loading" || status === "redirecting" ? fallback : children}
    </TLLayout>
  );
}
