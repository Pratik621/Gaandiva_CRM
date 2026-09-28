import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Compliance acknowledgment ("Mark as read") — required flow for alerts. */
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

    const { data: existing } = await supabase
      .from("announcement_recipients")
      .select("read_at, acknowledged_at")
      .eq("announcement_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Not a recipient" }, { status: 404 });
    }
    const row = existing as { read_at: string | null; acknowledged_at: string | null };
    if (row.acknowledged_at) {
      return NextResponse.json({ ok: true });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("announcement_recipients")
      .update({ acknowledged_at: now, read_at: row.read_at ?? now } as never)
      .eq("announcement_id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Announcement acknowledge error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
