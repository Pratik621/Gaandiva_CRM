"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import AnnouncementsPage from "@/components/Announcements/AnnouncementsPage";

export default function STLAnnouncementsPage() {
  const { status } = useRoleGuard(["stl", "senior_team_leader", "operations_manager", "admin"]);
  if (status !== "authorized") {
    return null;
  }
  return <AnnouncementsPage />;
}
