import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasOperationsManagerAccess } from "@/lib/auth/tl-access";
import { hasSTLAccess, isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { attachAgentsToSTLHierarchy, buildSTLHierarchy } from "@/lib/stl/team-hierarchy";
import { buildTeamHierarchy } from "@/lib/tl/team-hierarchy";
import { chunkIds } from "@/lib/supabase/in-chunks";

export const dynamic = "force-dynamic";

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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const isOrgWide = hasOperationsManagerAccess(roleNames) || roleNames.includes("admin");
    const isSTL = roleNames.some((n) => isSeniorTeamLeaderRole(n));

    if (!hasSTLAccess(roleNames) && !roleNames.includes("admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    const { data: usersWithRoles, error: usersError } = await admin
      .from("users")
      .select(
        "id, full_name, email, agent_code, status, stl_id, reporting_manager_id, user_roles(roles(name))"
      )
      .eq("organization_id", orgId)
      .order("full_name");

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const { data: campaigns, error: campaignsError } = await admin
      .from("campaigns")
      .select("id, assigned_stl_id, assigned_team_leader_id")
      .eq("organization_id", orgId);

    if (campaignsError) {
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    const campaignList = (campaigns ?? []) as {
      id: string;
      assigned_stl_id: string | null;
      assigned_team_leader_id: string | null;
    }[];
    const campaignIds = campaignList.map((c) => c.id);

    // Needed to derive which agents work under each Team Leader (same source
    // /tl/team uses) — chunked since an org can have hundreds of campaigns.
    let assignments: { campaign_id: string; agent_id: string }[] = [];
    if (campaignIds.length > 0) {
      for (const idChunk of chunkIds(campaignIds)) {
        const { data: assignmentRows, error: assignError } = await admin
          .from("campaign_assignments")
          .select("campaign_id, agent_id")
          .in("campaign_id", idChunk)
          .eq("is_active", true);

        if (assignError) {
          return NextResponse.json({ error: assignError.message }, { status: 500 });
        }
        assignments.push(
          ...((assignmentRows ?? []) as { campaign_id: string; agent_id: string }[])
        );
      }
    }

    const rawUsers = usersWithRoles ?? [];

    const tlHierarchy = buildTeamHierarchy(
      rawUsers as unknown as Parameters<typeof buildTeamHierarchy>[0],
      campaignList,
      assignments
    );

    let hierarchy = attachAgentsToSTLHierarchy(
      buildSTLHierarchy(
        rawUsers as unknown as Parameters<typeof buildSTLHierarchy>[0],
        campaignList
      ),
      tlHierarchy
    );

    if (!isOrgWide && isSTL) {
      const ownNode = hierarchy.stls.find((s) => s.id === user.id);
      hierarchy = {
        ...hierarchy,
        stls: ownNode ? [ownNode] : [],
        unassigned_team_leaders: [],
        stats: {
          stl_count: ownNode ? 1 : 0,
          total_team_leaders: ownNode?.team_leader_count ?? 0,
          assigned_team_leaders: ownNode?.team_leader_count ?? 0,
          unassigned_team_leaders: 0,
        },
      };
    }

    return NextResponse.json({
      ...hierarchy,
      scope: isOrgWide ? "organization" : "team",
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("STL team hierarchy fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
