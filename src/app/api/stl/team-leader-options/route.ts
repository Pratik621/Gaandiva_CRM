import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasOperationsManagerAccess, isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";

export const dynamic = "force-dynamic";

/**
 * Lists TL-role users an STL can delegate a campaign down to — scoped to the
 * STL's own team (users.stl_id = the requesting STL). OM/admin get the full
 * org roster since they aren't delegating from a specific team.
 */
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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const isOrgWide = hasOperationsManagerAccess(roleNames) || roleNames.includes("admin");

    let query = admin
      .from("users")
      .select("id, full_name, email, stl_id, user_roles(roles(name))")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("full_name");

    if (!isOrgWide) {
      query = query.eq("stl_id", user.id);
    }

    const { data: usersWithRoles, error } = await query;

    if (error) {
      console.error("TL options fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type UserWithRoles = { id: string; full_name: string | null; email: string | null; user_roles: { roles: { name: string } | null }[] | null };
    const teamLeaders = ((usersWithRoles ?? []) as UserWithRoles[])
      .filter((u) => {
        const ur = u.user_roles;
        if (!ur || !Array.isArray(ur)) return false;
        return ur.some((r) => isCampaignTeamLeaderRole(r.roles?.name));
      })
      .map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }));

    return NextResponse.json({ team_leaders: teamLeaders });
  } catch (err) {
    console.error("Fetch TL options error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
