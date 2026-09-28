import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    // RLS on `campaigns` only grants org-wide SELECT to a few specific roles
    // (qa, team_leader/tl/stl/operations_manager, admin) — qa_tl isn't among
    // them, so this must bypass RLS via the admin client to work for QATL too.
    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data: campaigns, error: campaignsError } = await admin
      .from("campaigns")
      .select("id, campaign_id, name, status, start_date, end_date")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (campaignsError) {
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    return NextResponse.json({ campaigns: campaigns ?? [] });
  } catch (err) {
    console.error("QA Recordings list error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
