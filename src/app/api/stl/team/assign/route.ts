import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasOperationsManagerAccess, isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { createNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Reassign a single Team Leader to a Senior Team Leader (or unassign).
 *
 * Body: { team_leader_id: string, stl_id: string | null }
 * - When `stl_id` is null, the TL's `stl_id` is cleared.
 * - When set, the target user must be in the same organization and hold the
 *   STL role.
 *
 * Allowed for: Operations Manager, Admin.
 */
export async function POST(request: Request) {
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
    const canAssign = hasOperationsManagerAccess(roleNames) || roleNames.includes("admin");
    if (!canAssign) {
      return NextResponse.json(
        { error: "Only Operations Manager or Admin can assign a Team Leader to a Senior Team Leader" },
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

    const body = (await request.json().catch(() => ({}))) as {
      team_leader_id?: string;
      stl_id?: string | null;
    };

    const teamLeaderId =
      typeof body.team_leader_id === "string" ? body.team_leader_id.trim() : "";
    const stlId =
      typeof body.stl_id === "string" && body.stl_id.trim() ? body.stl_id.trim() : null;

    if (!teamLeaderId) {
      return NextResponse.json({ error: "team_leader_id is required" }, { status: 400 });
    }

    if (stlId === teamLeaderId) {
      return NextResponse.json(
        { error: "A Team Leader cannot report to themselves" },
        { status: 400 }
      );
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const ids = stlId ? [teamLeaderId, stlId] : [teamLeaderId];
    const { data: people, error: peopleErr } = await admin
      .from("users")
      .select("id, full_name, email, organization_id, stl_id, status, user_roles(roles(name))")
      .in("id", ids);

    if (peopleErr) {
      return NextResponse.json({ error: peopleErr.message }, { status: 500 });
    }

    type Person = {
      id: string;
      full_name: string | null;
      email: string | null;
      organization_id: string | null;
      stl_id: string | null;
      status: string;
      user_roles: { roles: { name: string } | null }[] | null;
    };

    const rows = (people ?? []) as Person[];
    const teamLeader = rows.find((r) => r.id === teamLeaderId);
    const targetStl = stlId ? rows.find((r) => r.id === stlId) : null;

    if (!teamLeader) {
      return NextResponse.json({ error: "Team Leader not found" }, { status: 404 });
    }
    if (teamLeader.organization_id !== orgId) {
      return NextResponse.json({ error: "Team Leader not in your organization" }, { status: 403 });
    }
    if (teamLeader.status !== "active") {
      return NextResponse.json({ error: "Team Leader is not active" }, { status: 400 });
    }
    const isTl = (teamLeader.user_roles ?? []).some((ur) => isCampaignTeamLeaderRole(ur.roles?.name));
    if (!isTl) {
      return NextResponse.json({ error: "Selected user does not have a Team Leader role" }, { status: 400 });
    }

    if (stlId) {
      if (!targetStl) {
        return NextResponse.json({ error: "Senior Team Leader not found" }, { status: 404 });
      }
      if (targetStl.organization_id !== orgId) {
        return NextResponse.json(
          { error: "Senior Team Leader not in your organization" },
          { status: 403 }
        );
      }
      if (targetStl.status !== "active") {
        return NextResponse.json({ error: "Senior Team Leader is not active" }, { status: 400 });
      }
      const isStl = (targetStl.user_roles ?? []).some((ur) => isSeniorTeamLeaderRole(ur.roles?.name));
      if (!isStl) {
        return NextResponse.json({ error: "Selected user is not a Senior Team Leader" }, { status: 400 });
      }
    }

    if (teamLeader.stl_id === stlId) {
      return NextResponse.json({
        success: true,
        team_leader_id: teamLeaderId,
        stl_id: stlId,
        unchanged: true,
      });
    }

    const { error: updateError } = await admin
      .from("users")
      .update({ stl_id: stlId } as never)
      .eq("id", teamLeaderId)
      .eq("organization_id", orgId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (stlId && targetStl) {
      const tlLabel = teamLeader.full_name?.trim() || teamLeader.email?.trim() || "A team leader";
      const stlLabel = targetStl.full_name?.trim() || targetStl.email?.trim() || "your team";
      void createNotifications([
        {
          title: "Team assignment updated",
          message: `You have been assigned to report to ${stlLabel}.`,
          type: "system",
          sender_id: user.id,
          receiver_id: teamLeader.id,
          organization_id: orgId,
        },
        {
          title: "New Team Leader added to your team",
          message: `${tlLabel} has been added to your team.`,
          type: "system",
          sender_id: user.id,
          receiver_id: targetStl.id,
          organization_id: orgId,
        },
      ]);
    }

    return NextResponse.json({
      success: true,
      team_leader_id: teamLeaderId,
      stl_id: stlId,
    });
  } catch (err) {
    console.error("STL team assign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
