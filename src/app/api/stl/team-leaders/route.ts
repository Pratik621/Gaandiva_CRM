import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";

export const dynamic = "force-dynamic";

/** Lists STL-role users in the org — populates the OM "Assign STL" modal on /stl/campaigns. */
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

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data: usersWithRoles, error } = await admin
      .from("users")
      .select("id, full_name, email, user_roles(roles(name))")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("full_name");

    if (error) {
      console.error("STL list fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type UserWithRoles = { id: string; full_name: string | null; email: string | null; user_roles: { roles: { name: string } | null }[] | null };
    const stls = ((usersWithRoles ?? []) as UserWithRoles[])
      .filter((u) => {
        const ur = u.user_roles;
        if (!ur || !Array.isArray(ur)) return false;
        return ur.some((r) => isSeniorTeamLeaderRole(r.roles?.name));
      })
      .map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }));

    return NextResponse.json({ stls, team_leaders: stls });
  } catch (err) {
    console.error("Fetch STLs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
