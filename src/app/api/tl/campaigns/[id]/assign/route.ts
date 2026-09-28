import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createNotifications } from "@/lib/notifications";
import { hasOperationsManagerAccess } from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { isUserAssignedToCampaignAsTeamLeader } from "@/lib/campaign/team-leader-assignments";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const body = await request.json();
    const agent_ids = Array.isArray(body?.agent_ids) ? body.agent_ids : [];

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    if (hasOperationsManagerAccess(roleNames)) {
      return NextResponse.json(
        { error: "Operations Manager assigns Team Leaders, not agents" },
        { status: 403 }
      );
    }

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, name, assigned_team_leader_id")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const camp = campaign as {
      id: string;
      name: string;
      assigned_team_leader_id: string | null;
    };
    const tlAssigned = await isUserAssignedToCampaignAsTeamLeader(
      supabase,
      campaignId,
      user.id,
      camp.assigned_team_leader_id
    );
    if (!tlAssigned) {
      return NextResponse.json(
        { error: "You can only assign agents to campaigns assigned to you" },
        { status: 403 }
      );
    }

    const { data: existing } = await supabase
      .from("campaign_assignments")
      .select("agent_id")
      .eq("campaign_id", campaignId);

    const existingIds = new Set(((existing ?? []) as { agent_id: string }[]).map((a) => a.agent_id));
    const newIds = new Set(agent_ids);

    const toInsert: { organization_id: string; campaign_id: string; agent_id: string; assigned_by: string }[] = [];
    const toDeactivate: string[] = [];

    for (const agentId of agent_ids) {
      if (!existingIds.has(agentId)) {
        toInsert.push({
          organization_id: orgId,
          campaign_id: campaignId,
          agent_id: agentId,
          assigned_by: user.id,
        });
      } else {
        await supabase
          .from("campaign_assignments")
          .update({ is_active: true, assigned_by: user.id } as never)
          .eq("campaign_id", campaignId)
          .eq("agent_id", agentId);
      }
    }

    for (const agentId of existingIds) {
      if (!newIds.has(agentId)) {
        toDeactivate.push(agentId);
      }
    }

    if (toDeactivate.length > 0) {
      await supabase
        .from("campaign_assignments")
        .update({ is_active: false } as never)
        .eq("campaign_id", campaignId)
        .in("agent_id", toDeactivate);
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("campaign_assignments")
        .insert(toInsert as never);

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      void createNotifications(
        toInsert.map((a) => ({
          title: "Campaign Assigned",
          message: `You have been assigned to campaign "${camp.name}". Check your dashboard for leads.`,
          type: "campaign" as const,
          sender_id: user.id,
          receiver_id: a.agent_id,
          reference_type: "campaign" as const,
          reference_id: campaignId,
          organization_id: orgId,
        }))
      );
    }

    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "campaigns",
      eventType: "campaign_agents_assigned",
      description: `Updated agent assignments on campaign "${camp.name}" (${agent_ids.length} assigned)`,
      targetType: "campaign",
      targetId: campaignId,
      targetLabel: camp.name,
      metadata: {
        assigned_count: agent_ids.length,
        added_count: toInsert.length,
        removed_count: toDeactivate.length,
        agent_ids,
        source: "tl_campaign_assign",
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Assign agents error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
