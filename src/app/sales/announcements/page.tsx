"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import AnnouncementsPage from "@/components/Announcements/AnnouncementsPage";

export default function SalesAnnouncementsPage() {
  const { status } = useRoleGuard(["sales", "sales_manager", "admin"]);
  if (status !== "authorized") {
    return null;
  }
  return <AnnouncementsPage />;
}
