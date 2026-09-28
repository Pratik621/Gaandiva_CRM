import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { isPollClosed } from "@/lib/announcements/queries";

export const dynamic = "force-dynamic";

const MAX_PENDING_ALERTS = 10;
const PENDING_SCAN_CAP = 500;

/**
 * Lightweight feed for the blocking alert banner + pending counts.
 * Hits the partial index on announcement_recipients (unacknowledged rows).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("announcement_recipients")
      .select(
        "announcement_id, created_at, read_at, acknowledged_at, announcements!inner(id, type, title, message, created_by, closes_at, created_at, deleted_at)"
      )
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .is("announcements.deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(PENDING_SCAN_CAP);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type Row = {
      announcement_id: string;
      read_at: string | null;
      acknowledged_at: string | null;
      announcements: {
        id: string;
        type: string;
        title: string;
        message: string;
        created_by: string;
        closes_at: string | null;
        created_at: string;
      } | null;
    };
    const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.announcements);

    // Blocking banner: unacknowledged alerts, oldest first.
    const alertRows = rows
      .filter((r) => r.announcements!.type === "alert" && !r.acknowledged_at)
      .sort(
        (a, b) =>
          new Date(a.announcements!.created_at).getTime() -
          new Date(b.announcements!.created_at).getTime()
      )
      .slice(0, MAX_PENDING_ALERTS);

    // Header dropdown: recent unread announcements of any type.
    const unreadRows = rows.filter((r) => !r.read_at);

    const openPollIds = rows
      .filter(
        (r) => r.announcements!.type === "poll" && !isPollClosed(r.announcements!.closes_at)
      )
      .map((r) => r.announcement_id);

    let pendingPollCount = 0;
    if (openPollIds.length > 0) {
      const { data: myVotes } = await supabase
        .from("poll_votes")
        .select("announcement_id")
        .eq("user_id", user.id)
        .in("announcement_id", openPollIds);
      const voted = new Set(
        ((myVotes ?? []) as { announcement_id: string }[]).map((v) => v.announcement_id)
      );
      pendingPollCount = openPollIds.filter((id) => !voted.has(id)).length;
    }

    const recentUnread = unreadRows.slice(0, 5);

    const admin = getAdminClientSafe();
    const senderIds = [
      ...new Set(
        [...alertRows, ...recentUnread].map((r) => r.announcements!.created_by)
      ),
    ];
    const senderNames =
      admin && senderIds.length > 0 ? await resolveUserDisplayNames(admin, senderIds) : {};

    return NextResponse.json({
      alerts: alertRows.map((r) => ({
        id: r.announcements!.id,
        title: r.announcements!.title,
        message: r.announcements!.message,
        created_at: r.announcements!.created_at,
        sender_name: senderNames[r.announcements!.created_by] ?? null,
      })),
      pending_poll_count: pendingPollCount,
      unread_count: unreadRows.length,
      unread: recentUnread.map((r) => ({
        id: r.announcements!.id,
        type: r.announcements!.type,
        title: r.announcements!.title,
        created_at: r.announcements!.created_at,
        sender_name: senderNames[r.announcements!.created_by] ?? null,
      })),
    });
  } catch (err) {
    console.error("Announcements pending error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
