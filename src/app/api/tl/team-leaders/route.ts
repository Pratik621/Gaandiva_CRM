import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";

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

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    // Fetch all active users in org with their roles in one query
    const { data: usersWithRoles, error } = await admin
      .from("users")
      .select("id, full_name, email, user_roles(roles(name))")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("full_name");

    if (error) {
      console.error("Team leaders fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type UserWithRoles = { id: string; full_name: string | null; email: string | null; user_roles: { roles: { name: string } | null }[] | null };
    // Includes STL users alongside actual Team Leaders — OM assigns either from this one
    // list; which underlying table a selection lands in is decided by the assign route
    // based on the person's real role, not by this list.
    const teamLeaders = ((usersWithRoles ?? []) as UserWithRoles[])
      .map((u) => {
        const ur = u.user_roles;
        const roleNames = Array.isArray(ur) ? ur.map((r) => r.roles?.name) : [];
        const isStl = roleNames.some((n) => isSeniorTeamLeaderRole(n));
        const isTl = roleNames.some((n) => isCampaignTeamLeaderRole(n));
        if (!isStl && !isTl) return null;
        return {
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          role: isStl ? ("stl" as const) : ("tl" as const),
        };
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    return NextResponse.json({ team_leaders: teamLeaders });
  } catch (err) {
    console.error("Fetch team leaders error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
