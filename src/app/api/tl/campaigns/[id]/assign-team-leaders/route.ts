import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAssignCampaignTeamLeader, isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { syncCampaignTeamLeaderAssignments } from "@/lib/campaign/team-leader-assignments";
import { syncCampaignSTLAssignments } from "@/lib/campaign/stl-assignments";
import { createNotifications } from "@/lib/notifications";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

/**
 * OM assigns campaign owners from one shared picker that lists both Team
 * Leaders and STLs (see /api/tl/team-leaders). Each selected id is routed to
 * the assignment table that matches that person's actual role — a Team
 * Leader pick lands in campaign_team_leader_assignments (unchanged, existing
 * behavior), an STL pick lands in campaign_stl_assignments (new).
 */
export async function POST(
  request: Request,
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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    if (!canAssignCampaignTeamLeader(roleNames)) {
      return NextResponse.json(
        { error: "You do not have permission to assign Team Leaders" },
        { status: 403 }
      );
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

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const body = await request.json();
    const selectedIds = Array.isArray(body?.team_leader_ids)
      ? [...new Set((body.team_leader_ids as string[]).filter(Boolean))]
      : [];

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, name, assigned_team_leader_id, assigned_stl_id")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const camp = campaign as {
      id: string;
      name: string;
      assigned_team_leader_id: string | null;
      assigned_stl_id: string | null;
    };

    // Split the shared selection by each person's actual role.
    let team_leader_ids: string[] = [];
    let stl_ids: string[] = [];
    if (selectedIds.length > 0) {
      const { data: peopleRows, error: peopleError } = await supabase
        .from("users")
        .select("id, user_roles(roles(name))")
        .eq("organization_id", orgId)
        .in("id", selectedIds);

      if (peopleError) {
        return NextResponse.json({ error: peopleError.message }, { status: 500 });
      }

      type PersonRow = { id: string; user_roles: { roles: { name: string } | null }[] | null };
      for (const p of (peopleRows ?? []) as PersonRow[]) {
        const names = (p.user_roles ?? []).map((ur) => ur.roles?.name);
        if (names.some((n) => isSeniorTeamLeaderRole(n))) {
          stl_ids.push(p.id);
        } else if (names.some((n) => isCampaignTeamLeaderRole(n))) {
          team_leader_ids.push(p.id);
        }
      }
    }

    const previousTlIds = await supabase
      .from("campaign_team_leader_assignments")
      .select("team_leader_id")
      .eq("campaign_id", campaignId)
      .eq("is_active", true);
    const prevTlSet = new Set(
      ((previousTlIds.data ?? []) as { team_leader_id: string }[]).map((r) => r.team_leader_id)
    );
    if (camp.assigned_team_leader_id) prevTlSet.add(camp.assigned_team_leader_id);

    const previousStlIds = await supabase
      .from("campaign_stl_assignments")
      .select("stl_id")
      .eq("campaign_id", campaignId)
      .eq("is_active", true);
    const prevStlSet = new Set(
      ((previousStlIds.data ?? []) as { stl_id: string }[]).map((r) => r.stl_id)
    );
    if (camp.assigned_stl_id) prevStlSet.add(camp.assigned_stl_id);

    const [tlSync, stlSync] = await Promise.all([
      syncCampaignTeamLeaderAssignments(supabase, {
        organizationId: orgId,
        campaignId,
        teamLeaderIds: team_leader_ids,
        assignedBy: user.id,
      }),
      syncCampaignSTLAssignments(supabase, {
        organizationId: orgId,
        campaignId,
        stlIds: stl_ids,
        assignedBy: user.id,
      }),
    ]);

    if (tlSync.error) {
      return NextResponse.json({ error: tlSync.error }, { status: 500 });
    }
    if (stlSync.error) {
      return NextResponse.json({ error: stlSync.error }, { status: 500 });
    }

    const newlyAssigned = [
      ...team_leader_ids.filter((id) => !prevTlSet.has(id)),
      ...stl_ids.filter((id) => !prevStlSet.has(id)),
    ];
    if (newlyAssigned.length > 0) {
      void createNotifications(
        newlyAssigned.map((receiverId) => ({
          title: "Campaign Assigned",
          message: `Campaign "${camp.name}" has been assigned to you.`,
          type: "campaign" as const,
          sender_id: user.id,
          receiver_id: receiverId,
          reference_type: "campaign" as const,
          reference_id: campaignId,
          organization_id: orgId,
        }))
      );
    }

    const removedCount =
      [...prevTlSet].filter((id) => !team_leader_ids.includes(id)).length +
      [...prevStlSet].filter((id) => !stl_ids.includes(id)).length;

    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "campaigns",
      eventType: "campaign_team_leaders_assigned",
      description: `Updated campaign owner assignments on campaign "${camp.name}" (${team_leader_ids.length} team leader(s), ${stl_ids.length} STL(s))`,
      targetType: "campaign",
      targetId: campaignId,
      targetLabel: camp.name,
      metadata: {
        assigned_count: team_leader_ids.length + stl_ids.length,
        added_count: newlyAssigned.length,
        removed_count: removedCount,
        team_leader_ids,
        stl_ids,
        primary_team_leader_id: tlSync.primaryTeamLeaderId,
        primary_stl_id: stlSync.primarySTLId,
        source: "tl_assign_team_leaders",
      },
      request,
    });

    return NextResponse.json({
      success: true,
      assigned_team_leader_id: tlSync.primaryTeamLeaderId,
      assigned_stl_id: stlSync.primarySTLId,
    });
  } catch (err) {
    console.error("Assign team leaders error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
