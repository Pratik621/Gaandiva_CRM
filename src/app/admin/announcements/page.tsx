"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import AnnouncementsPage from "@/components/Announcements/AnnouncementsPage";

export default function AdminAnnouncementsPage() {
  const { status } = useRoleGuard(["admin"]);
  if (status !== "authorized") {
    return null;
  }
  return <AnnouncementsPage />;
}
