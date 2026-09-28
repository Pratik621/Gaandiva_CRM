import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

    // First-read timestamp only — never overwrite an earlier read_at.
    const { data: existing } = await supabase
      .from("announcement_recipients")
      .select("read_at")
      .eq("announcement_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Not a recipient" }, { status: 404 });
    }
    if ((existing as { read_at: string | null }).read_at) {
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase
      .from("announcement_recipients")
      .update({ read_at: new Date().toISOString() } as never)
      .eq("announcement_id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Announcement read error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
