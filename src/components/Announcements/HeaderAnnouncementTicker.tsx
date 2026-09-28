"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRightIcon } from "lucide-react";
import {
  Announcement,
  AnnouncementTag,
  AnnouncementTitle,
} from "@/components/ui/announcement";
import { useAuth } from "@/context/AuthContext";
import { useAnnouncementCounts } from "@/hooks/useAnnouncementCounts";
import { resolveAnnouncementsPath } from "@/lib/announcements/nav";

/** Per-type pill theme + short tag label. */
const TYPE_THEME: Record<string, { tag: string; pill: string }> = {
  note: { tag: "Info", pill: "bg-sky-100 text-sky-700" },
  warning: { tag: "Warning", pill: "bg-amber-100 text-amber-700" },
  alert: { tag: "Alert", pill: "bg-red-100 text-red-700" },
  poll: { tag: "Poll", pill: "bg-violet-100 text-violet-700" },
};

/**
 * Compact header pill showing the latest unread announcement. Clicking it
 * opens the role's Announcements page. Renders nothing when all caught up.
 */
export default function HeaderAnnouncementTicker() {
  const router = useRouter();
  const { user, hasRole, isInitialized } = useAuth();
  const { data } = useAnnouncementCounts(Boolean(user) && isInitialized);

  const latest = data?.unread?.[0] ?? null;
  if (!latest) return null;

  const theme = TYPE_THEME[latest.type] ?? TYPE_THEME.note;
  const extraCount = (data?.unread_count ?? 1) - 1;

  return (
    <button
      type="button"
      onClick={() => router.push(resolveAnnouncementsPath(hasRole))}
      aria-label={`Announcement: ${latest.title}`}
      style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", minWidth: 0, maxWidth: "100%" }}
    >
      <Announcement themed className={theme.pill}>
        <AnnouncementTag>{theme.tag}</AnnouncementTag>
        <AnnouncementTitle>
          <span className="truncate">{latest.title}</span>
          {extraCount > 0 ? (
            <span className="shrink-0 text-xs opacity-70">+{extraCount}</span>
          ) : null}
          <ArrowUpRightIcon size={16} className="shrink-0 opacity-70" />
        </AnnouncementTitle>
      </Announcement>
    </button>
  );
}
