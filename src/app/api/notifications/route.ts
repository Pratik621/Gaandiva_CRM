import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, title, message, type, sender_id, reference_type, reference_id, is_read, created_at"
      )
      .eq("receiver_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .eq("is_read", false);

    return NextResponse.json({
      notifications: data ?? [],
      unread_count: count ?? 0,
    });
  } catch (err) {
    console.error("Notifications GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
