"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import AnnouncementsPage from "@/components/Announcements/AnnouncementsPage";

export default function QATLAnnouncementsPage() {
  const { status } = useRoleGuard(["qa_tl", "admin"]);
  if (status !== "authorized") {
    return null;
  }
  return <AnnouncementsPage />;
}
