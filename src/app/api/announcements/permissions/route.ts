import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { fetchPermissionRulesForSender } from "@/lib/announcements/permissions";

export const dynamic = "force-dynamic";

/** Matrix rules for the caller — drives the Create UI (never URL-based). */
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

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ can_send: false, rules: [] });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ can_send: false, rules: [] });
    }

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const rules = await fetchPermissionRulesForSender(admin, orgId, roleNames);

    return NextResponse.json({ can_send: rules.length > 0, rules });
  } catch (err) {
    console.error("Announcements permissions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
