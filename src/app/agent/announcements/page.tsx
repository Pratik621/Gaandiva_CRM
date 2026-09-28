"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import AnnouncementsPage from "@/components/Announcements/AnnouncementsPage";

export default function AgentAnnouncementsPage() {
  const { status } = useRoleGuard(["agent"]);
  if (status !== "authorized") {
    return null;
  }
  return <AnnouncementsPage />;
}
