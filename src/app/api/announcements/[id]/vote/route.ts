import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { fetchPollBundle, isPollClosed } from "@/lib/announcements/queries";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
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

    const body = (await request.json().catch(() => null)) as { option_id?: string } | null;
    const optionId = typeof body?.option_id === "string" ? body.option_id : "";
    if (!optionId) {
      return NextResponse.json({ error: "option_id is required" }, { status: 400 });
    }

    // Visible-to-me poll (RLS enforces recipient/creator visibility).
    const { data: announcement } = await supabase
      .from("announcements")
      .select("id, type, closes_at, organization_id")
      .eq("id", id)
      .maybeSingle();
    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }
    const a = announcement as {
      id: string;
      type: string;
      closes_at: string | null;
      organization_id: string;
    };
    if (a.type !== "poll") {
      return NextResponse.json({ error: "Not a poll" }, { status: 400 });
    }
    if (isPollClosed(a.closes_at)) {
      return NextResponse.json({ error: "Poll is closed" }, { status: 400 });
    }

    // Insert as the user — RLS re-checks recipient membership + open window,
    // the unique constraint enforces one vote per poll, and the composite FK
    // rejects options from another poll.
    const { error: voteError } = await supabase.from("poll_votes").insert({
      announcement_id: id,
      poll_option_id: optionId,
      user_id: user.id,
      organization_id: a.organization_id,
    } as never);

    if (voteError) {
      if (voteError.code === "23505") {
        return NextResponse.json({ error: "You have already voted" }, { status: 409 });
      }
      if (voteError.code === "23503") {
        return NextResponse.json({ error: "Invalid option for this poll" }, { status: 400 });
      }
      if (voteError.code === "42501") {
        return NextResponse.json({ error: "Voting not allowed" }, { status: 403 });
      }
      return NextResponse.json({ error: voteError.message }, { status: 500 });
    }

    // Voter earns results visibility immediately.
    const admin = getAdminClientSafe();
    const results = admin
      ? (await fetchPollBundle(admin, user.id, [id])).resultsByAnnouncement.get(id) ?? null
      : null;

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("Announcement vote error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
