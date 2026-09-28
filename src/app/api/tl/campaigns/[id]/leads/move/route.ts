import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOperationsManagerAccess } from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { isUserAssignedToCampaignAsTeamLeader } from "@/lib/campaign/team-leader-assignments";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";
import { createCampaignLog } from "@/lib/campaign-logs";
export const dynamic = "force-dynamic";
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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (
      profile as { organization_id: string | null } | null
    )?.organization_id;

    if (!orgId) {
      return NextResponse.json(
        { error: "No organization" },
        { status: 400 }
      );
    }
    const { id: campaignId } = await params;

    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign ID required" },
        { status: 400 }
      );
    }
    const body = await request.json();

    const leadIds = Array.isArray(body?.lead_ids)
      ? body.lead_ids.map(String).filter(Boolean)
      : [];

    const targetCampaignId = body?.target_campaign_id
      ? String(body.target_campaign_id)
      : "";

    if (leadIds.length === 0) {
      return NextResponse.json(
        { error: "At least one lead must be selected" },
        { status: 400 }
      );
    }

    if (!targetCampaignId) {
      return NextResponse.json(
        { error: "Target campaign is required" },
        { status: 400 }
      );
    }

    if (campaignId === targetCampaignId) {
      return NextResponse.json(
        {
          error: "Leads are already in this campaign",
        },
        { status: 400 }
      );
    }
    const uniqueLeadIds = [...new Set(leadIds)];
    const roleNames = await fetchUserRoleNames(
      supabase,
      user.id
    );

    if (hasOperationsManagerAccess(roleNames)) {
      return NextResponse.json(
        {
          error:
            "Operations Manager cannot move leads from this screen",
        },
        { status: 403 }
      );
    }
    const { data: sourceCampaign, error: sourceCampaignError } =
      await supabase
        .from("campaigns")
        .select(
          "id, name, assigned_team_leader_id"
        )
        .eq("id", campaignId)
        .eq("organization_id", orgId)
        .single();

    if (sourceCampaignError || !sourceCampaign) {
      return NextResponse.json(
        { error: "Source campaign not found" },
        { status: 404 }
      );
    }

    const source = sourceCampaign as {
      id: string;
      name: string;
      assigned_team_leader_id: string | null;
    };

    const tlAssigned =
      await isUserAssignedToCampaignAsTeamLeader(
        supabase,
        campaignId,
        user.id,
        source.assigned_team_leader_id
      );

    if (!tlAssigned) {
      return NextResponse.json(
        {
          error:
            "You can only move leads from campaigns assigned to you",
        },
        { status: 403 }
      );
    }

    const { data: targetCampaign, error: targetCampaignError } =
      await supabase
        .from("campaigns")
        .select("id, name")
        .eq("id", targetCampaignId)
        .eq("organization_id", orgId)
        .single();

    if (targetCampaignError || !targetCampaign) {
      return NextResponse.json(
        { error: "Target campaign not found" },
        { status: 404 }
      );
    }

    const target = targetCampaign as {
      id: string;
      name: string;
    };

    const { data: leads, error: leadsError } =
      await supabase
        .from("leads")
        .select("id, campaign_id")
        .in("id", uniqueLeadIds)
        .eq("campaign_id", campaignId)
        .eq("organization_id", orgId);

    if (leadsError) {
      console.error(
        "Find leads before move error:",
        leadsError
      );

      return NextResponse.json(
        {
          error: "Failed to find selected leads",
        },
        { status: 500 }
      );
    }

    const validLeads = (leads ?? []) as {
      id: string;
      campaign_id: string;
    }[];

    if (validLeads.length !== uniqueLeadIds.length) {
      const validLeadIdSet = new Set(
        validLeads.map((lead) => lead.id)
      );

      const invalidLeadIds = (uniqueLeadIds as string[]).filter(
        (leadId) => !validLeadIdSet.has(leadId)
      );

      return NextResponse.json(
        {
          error:
            "One or more selected leads do not belong to this campaign",
          invalid_lead_ids: invalidLeadIds,
        },
        { status: 400 }
      );
    }
    const { data: movedLeads, error: moveError } =
      await supabase
        .from("leads")
        .update({
          campaign_id: targetCampaignId,
        } as never)
        .in("id", uniqueLeadIds)
        .eq("campaign_id", campaignId)
        .eq("organization_id", orgId)
        .select("id");

    if (moveError) {
      console.error(
        "Move leads error:",
        moveError
      );

      return NextResponse.json(
        {
          error: moveError.message,
        },
        { status: 500 }
      );
    }

    const movedCount = movedLeads?.length ?? 0;
    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "campaigns",
      eventType: "campaign_leads_moved",
      description: `Moved ${movedCount} lead${
        movedCount === 1 ? "" : "s"
      } from campaign "${source.name}" to campaign "${target.name}"`,
      targetType: "campaign",
      targetId: campaignId,
      targetLabel: source.name,
      metadata: {
        source_campaign_id: campaignId,
        source_campaign_name: source.name,
        target_campaign_id: targetCampaignId,
        target_campaign_name: target.name,
        requested_lead_count: uniqueLeadIds.length,
        moved_lead_count: movedCount,
        lead_ids: uniqueLeadIds,
        source: "tl_campaign_move_leads",
      },
      request,
    });

    void createCampaignLog(supabase, {
      campaign_id: campaignId,
      action: "campaign_updated",
      message: `${movedCount} lead${movedCount === 1 ? "" : "s"} moved to campaign "${target.name}"`,
      created_by: user.id,
    });

    void createCampaignLog(supabase, {
      campaign_id: targetCampaignId,
      action: "campaign_updated",
      message: `${movedCount} lead${movedCount === 1 ? "" : "s"} moved in from campaign "${source.name}"`,
      created_by: user.id,
    });
    return NextResponse.json({
      success: true,
      moved: movedCount,
      source_campaign: {
        id: source.id,
        name: source.name,
      },
      target_campaign: {
        id: target.id,
        name: target.name,
      },
    });
  } catch (err) {
    console.error("Move leads error:", err);

    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}