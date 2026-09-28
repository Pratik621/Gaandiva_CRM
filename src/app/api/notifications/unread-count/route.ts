import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Lightweight unread badge poll — one count query, no notification rows. */
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

    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .eq("is_read", false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ unread_count: count ?? 0 });
  } catch (err) {
    console.error("Notifications unread-count GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
