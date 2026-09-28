import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPollClosed } from "@/lib/announcements/queries";

export const dynamic = "force-dynamic";

/**
 * Dismiss hides the announcement from the inbox. Alerts can never be
 * dismissed (they require acknowledgment); open polls only after voting.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Announcement ID required" }, { status: 400 });
    }

    const { data: recipient } = await supabase
      .from("announcement_recipients")
      .select("read_at, announcements!inner(type, closes_at)")
      .eq("announcement_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!recipient) {
      return NextResponse.json({ error: "Not a recipient" }, { status: 404 });
    }
    const row = recipient as unknown as {
      read_at: string | null;
      announcements: { type: string; closes_at: string | null };
    };

    if (row.announcements.type === "alert") {
      return NextResponse.json(
        { error: "Alerts must be acknowledged, not dismissed" },
        { status: 400 }
      );
    }

    if (row.announcements.type === "poll" && !isPollClosed(row.announcements.closes_at)) {
      const { data: myVote } = await supabase
        .from("poll_votes")
        .select("id")
        .eq("announcement_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!myVote) {
        return NextResponse.json(
          { error: "Vote on the poll before dismissing it" },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("announcement_recipients")
      .update({ dismissed_at: now, read_at: row.read_at ?? now } as never)
      .eq("announcement_id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Announcement dismiss error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
