import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { POSTGREST_PAGE_SIZE } from "@/lib/supabase/in-chunks";
import {
  hasOperationsManagerAccess,
  hasTLAccess,
  isCampaignTeamLeaderRole,
} from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { buildTeamHierarchy } from "@/lib/tl/team-hierarchy";
import { chunkArray } from "@/lib/postgrest-filter";

export const dynamic = "force-dynamic";

async function fetchActiveCampaignAssignments(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  orgId: string
): Promise<{ campaign_id: string; agent_id: string }[]> {
  const all: { campaign_id: string; agent_id: string }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("campaign_assignments")
      .select("campaign_id, agent_id")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("assigned_at", { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as { campaign_id: string; agent_id: string }[];
    all.push(...page);
    if (page.length < POSTGREST_PAGE_SIZE) break;
    offset += POSTGREST_PAGE_SIZE;
  }
  return all;
}

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
    const isTeamLeader = roleNames.some((n) => isCampaignTeamLeaderRole(n));

    if (!hasTLAccess(roleNames) && !roleNames.includes("admin")) {
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
        "id, full_name, email, agent_code, status, reporting_manager_id, user_roles(roles(name))"
      )
      .eq("organization_id", orgId)
      .order("full_name");

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const { data: campaigns, error: campaignsError } = await admin
      .from("campaigns")
      .select("id, assigned_team_leader_id")
      .eq("organization_id", orgId);

    if (campaignsError) {
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    const campaignList = (campaigns ?? []) as {
      id: string;
      assigned_team_leader_id: string | null;
    }[];

    let assignments: { campaign_id: string; agent_id: string }[] = [];
    try {
      assignments = await fetchActiveCampaignAssignments(admin, orgId);
    } catch (assignErr) {
      const msg =
        assignErr instanceof Error ? assignErr.message : "Failed to load campaign assignments";
      console.error("Team hierarchy assignments error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    let hierarchy = buildTeamHierarchy(
      (usersWithRoles ?? []) as Parameters<typeof buildTeamHierarchy>[0],
      campaignList,
      assignments
    );

    if (!isOrgWide && isTeamLeader) {
      hierarchy = {
        ...hierarchy,
        team_leaders: hierarchy.team_leaders.filter((tl) => tl.id === user.id),
        unassigned_agents: [],
        stats: {
          team_leader_count: hierarchy.team_leaders.filter((tl) => tl.id === user.id).length,
          total_agents: hierarchy.team_leaders.find((tl) => tl.id === user.id)?.agent_count ?? 0,
          assigned_agents:
            hierarchy.team_leaders.find((tl) => tl.id === user.id)?.agent_count ?? 0,
          unassigned_agents: 0,
        },
      };
    }

    return NextResponse.json({
      ...hierarchy,
      scope: isOrgWide ? "organization" : "team",
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Team hierarchy fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
