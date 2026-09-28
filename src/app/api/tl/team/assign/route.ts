import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import {
  hasOperationsManagerAccess,
  isCampaignTeamLeaderRole,
} from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { isAgentRole } from "@/lib/tl/team-hierarchy";
import { createNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Reassign a single agent to a Team Leader (or unassign).
 *
 * Body: { agent_id: string, team_leader_id: string | null }
 * - When `team_leader_id` is null, the agent's `reporting_manager_id` is cleared.
 * - When set, the target user must be in the same organization and hold a
 *   campaign-eligible Team Leader role.
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
    const canAssign =
      hasOperationsManagerAccess(roleNames) || roleNames.includes("admin");
    if (!canAssign) {
      return NextResponse.json(
        { error: "Only Operations Manager or Admin can assign agents to a Team Leader" },
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
      agent_id?: string;
      team_leader_id?: string | null;
    };

    const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
    const teamLeaderId =
      typeof body.team_leader_id === "string" && body.team_leader_id.trim()
        ? body.team_leader_id.trim()
        : null;

    if (!agentId) {
      return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
    }

    if (teamLeaderId === agentId) {
      return NextResponse.json(
        { error: "An agent cannot report to themselves" },
        { status: 400 }
      );
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const ids = teamLeaderId ? [agentId, teamLeaderId] : [agentId];
    const { data: people, error: peopleErr } = await admin
      .from("users")
      .select(
        "id, full_name, email, organization_id, reporting_manager_id, status, user_roles(roles(name))"
      )
      .in("id", ids);

    if (peopleErr) {
      return NextResponse.json({ error: peopleErr.message }, { status: 500 });
    }

    type Person = {
      id: string;
      full_name: string | null;
      email: string | null;
      organization_id: string | null;
      reporting_manager_id: string | null;
      status: string;
      user_roles: { roles: { name: string } | null }[] | null;
    };

    const rows = (people ?? []) as Person[];
    const agent = rows.find((r) => r.id === agentId);
    const targetTl = teamLeaderId ? rows.find((r) => r.id === teamLeaderId) : null;

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    if (agent.organization_id !== orgId) {
      return NextResponse.json({ error: "Agent not in your organization" }, { status: 403 });
    }
    if (agent.status !== "active") {
      return NextResponse.json({ error: "Agent is not active" }, { status: 400 });
    }
    const agentHasAgentRole = (agent.user_roles ?? []).some((ur) =>
      isAgentRole(ur.roles?.name)
    );
    if (!agentHasAgentRole) {
      return NextResponse.json(
        { error: "Selected user does not have an Agent role" },
        { status: 400 }
      );
    }

    if (teamLeaderId) {
      if (!targetTl) {
        return NextResponse.json({ error: "Team Leader not found" }, { status: 404 });
      }
      if (targetTl.organization_id !== orgId) {
        return NextResponse.json(
          { error: "Team Leader not in your organization" },
          { status: 403 }
        );
      }
      if (targetTl.status !== "active") {
        return NextResponse.json({ error: "Team Leader is not active" }, { status: 400 });
      }
      const tlIsTL = (targetTl.user_roles ?? []).some((ur) =>
        isCampaignTeamLeaderRole(ur.roles?.name)
      );
      if (!tlIsTL) {
        return NextResponse.json(
          { error: "Selected user is not a Team Leader" },
          { status: 400 }
        );
      }
    }

    if (agent.reporting_manager_id === teamLeaderId) {
      return NextResponse.json({
        success: true,
        agent_id: agentId,
        team_leader_id: teamLeaderId,
        unchanged: true,
      });
    }

    const { error: updateError } = await admin
      .from("users")
      .update({ reporting_manager_id: teamLeaderId } as never)
      .eq("id", agentId)
      .eq("organization_id", orgId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (teamLeaderId && targetTl) {
      const agentLabel = agent.full_name?.trim() || agent.email?.trim() || "An agent";
      const tlLabel = targetTl.full_name?.trim() || targetTl.email?.trim() || "your team";
      void createNotifications([
        {
          title: "Team assignment updated",
          message: `You have been assigned to ${tlLabel}'s team.`,
          type: "system",
          sender_id: user.id,
          receiver_id: agent.id,
          organization_id: orgId,
        },
        {
          title: "New agent added to your team",
          message: `${agentLabel} has been added to your team.`,
          type: "system",
          sender_id: user.id,
          receiver_id: targetTl.id,
          organization_id: orgId,
        },
      ]);
    }

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      team_leader_id: teamLeaderId,
    });
  } catch (err) {
    console.error("Team assign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
