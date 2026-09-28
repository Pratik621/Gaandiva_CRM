import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import { isUserAssignedToCampaignAsSTL } from "@/lib/campaign/stl-assignments";
import {
  fetchActiveCampaignTeamLeaderIds,
  syncCampaignTeamLeaderAssignments,
} from "@/lib/campaign/team-leader-assignments";
import { createNotifications } from "@/lib/notifications";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

/**
 * STL manages which of their OWN Team Leaders (users.stl_id = this STL) are
 * delegated on a campaign assigned to them. This is additive/removable on
 * just her own team's presence — any Team Leader already on the campaign who
 * is NOT one of hers (e.g. assigned directly by OM) is left untouched.
 * Writes into the existing, shared campaign_team_leader_assignments table so
 * the unmodified /tl area picks it up exactly as if OM had assigned it.
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
    const selectedTeamLeaderIds = Array.isArray(body?.team_leader_ids)
      ? [...new Set((body.team_leader_ids as string[]).filter(Boolean))]
      : typeof body?.team_leader_id === "string" && body.team_leader_id.trim()
      ? [body.team_leader_id.trim()]
      : [];

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, name, assigned_stl_id, assigned_team_leader_id")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const camp = campaign as {
      id: string;
      name: string;
      assigned_stl_id: string | null;
      assigned_team_leader_id: string | null;
    };

    const stlAssigned = await isUserAssignedToCampaignAsSTL(
      supabase,
      campaignId,
      user.id,
      camp.assigned_stl_id
    );
    if (!stlAssigned) {
      return NextResponse.json(
        { error: "You can only delegate campaigns assigned to you" },
        { status: 403 }
      );
    }

    // Her own team roster — the selection must be a subset of this.
    const { data: myTeamRows, error: myTeamError } = await supabase
      .from("users")
      .select("id, full_name, email, status, user_roles(roles(name))")
      .eq("organization_id", orgId)
      .eq("stl_id", user.id);

    if (myTeamError) {
      return NextResponse.json({ error: myTeamError.message }, { status: 500 });
    }

    type TeamRow = {
      id: string;
      full_name: string | null;
      email: string | null;
      status: string;
      user_roles: { roles: { name: string } | null }[] | null;
    };
    const myTeam = ((myTeamRows ?? []) as TeamRow[]).filter((u) =>
      (u.user_roles ?? []).some((ur) => isCampaignTeamLeaderRole(ur.roles?.name))
    );
    const myTeamIds = new Set(myTeam.map((u) => u.id));

    const invalidIds = selectedTeamLeaderIds.filter((id) => !myTeamIds.has(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "You can only delegate to Team Leaders on your own team" },
        { status: 400 }
      );
    }
    const inactiveSelected = selectedTeamLeaderIds.filter(
      (id) => myTeam.find((u) => u.id === id)?.status !== "active"
    );
    if (inactiveSelected.length > 0) {
      return NextResponse.json({ error: "Selected Team Leader is not active" }, { status: 400 });
    }

    // Merge: keep any existing TL not on her team untouched, apply her selection for her own team.
    const existingActiveIds = await fetchActiveCampaignTeamLeaderIds(
      supabase,
      campaignId,
      camp.assigned_team_leader_id
    );
    const outsideHerTeamIds = existingActiveIds.filter((id) => !myTeamIds.has(id));
    const nextTeamLeaderIds = [...new Set([...outsideHerTeamIds, ...selectedTeamLeaderIds])];

    const prevSet = new Set(existingActiveIds);

    const { primaryTeamLeaderId, error: syncError } = await syncCampaignTeamLeaderAssignments(
      supabase,
      {
        organizationId: orgId,
        campaignId,
        teamLeaderIds: nextTeamLeaderIds,
        assignedBy: user.id,
      }
    );

    if (syncError) {
      return NextResponse.json({ error: syncError }, { status: 500 });
    }

    const newlyAssigned = selectedTeamLeaderIds.filter((id) => !prevSet.has(id));
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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "campaigns",
      eventType: "campaign_team_leaders_assigned",
      description: `STL updated their Team Leader delegation on campaign "${camp.name}"`,
      targetType: "campaign",
      targetId: campaignId,
      targetLabel: camp.name,
      metadata: {
        team_leader_ids: selectedTeamLeaderIds,
        source: "stl_delegate_to_team_leader",
      },
      request,
    });

    return NextResponse.json({
      success: true,
      assigned_team_leader_id: primaryTeamLeaderId,
    });
  } catch (err) {
    console.error("STL delegate to team leader error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
