"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import AnnouncementsPage from "@/components/Announcements/AnnouncementsPage";

export default function MISTLAnnouncementsPage() {
  const { status } = useRoleGuard(["mis_tl", "admin"]);
  if (status !== "authorized") {
    return null;
  }
  return <AnnouncementsPage />;
}
