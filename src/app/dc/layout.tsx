"use client";

import DCLayout from "@/components/DC/DCLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";

export default function DCRootLayout({ children }: { children: React.ReactNode }) {
  const { status } = useRoleGuard(["dc"]);
  if (status === "loading") return null;
  if (status === "redirecting") return null;
  return <DCLayout>{children}</DCLayout>;
}
