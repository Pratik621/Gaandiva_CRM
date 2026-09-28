"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import AnnouncementsPage from "@/components/Announcements/AnnouncementsPage";

export default function TLAnnouncementsPage() {
  const { status } = useRoleGuard(["team_leader", "tl", "operations_manager", "admin"]);
  if (status !== "authorized") {
    return null;
  }
  return <AnnouncementsPage />;
}
