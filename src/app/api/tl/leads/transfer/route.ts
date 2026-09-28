import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import {
  agentBelongsToTl,
  displayAgentName,
  fetchTeamContext,
  getAgentsUnderTl,
  type TransferMode,
} from "@/lib/tl/lead-transfer";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

type LeadRow = {
  id: string;
  campaign_id: string;
  assigned_agent_id: string | null;
  rep_id: string | null;
};

/**
 * POST /api/tl/leads/transfer
 * Transfer leads from an inactive agent to an active agent under the same TL.
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
    const isTL = roleNames.some((n) => isCampaignTeamLeaderRole(n));
    if (!isTL) {
      return NextResponse.json(
        { error: "Only Team Leaders can transfer leads" },
        { status: 403 }
      );
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id, full_name, email")
      .eq("id", user.id)
      .single();

    const profileRow = profile as {
      organization_id: string | null;
      full_name: string | null;
      email: string | null;
    } | null;

    const orgId = profileRow?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      from_agent_id?: string;
      to_agent_id?: string;
      transfer_mode?: TransferMode;
      campaign_id?: string;
      lead_ids?: string[];
      notes?: string;
    };

    const fromAgentId = body.from_agent_id?.trim() ?? "";
    const toAgentId = body.to_agent_id?.trim() ?? "";
    const transferMode = body.transfer_mode ?? "all";
    const campaignId = body.campaign_id?.trim() || undefined;
    const leadIds = Array.isArray(body.lead_ids)
      ? body.lead_ids.map((id) => id.trim()).filter(Boolean)
      : [];
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";

    if (!fromAgentId || !toAgentId) {
      return NextResponse.json(
        { error: "from_agent_id and to_agent_id are required" },
        { status: 400 }
      );
    }
    if (fromAgentId === toAgentId) {
      return NextResponse.json(
        { error: "Cannot transfer leads to the same agent" },
        { status: 400 }
      );
    }
    if (!["all", "campaign", "selected"].includes(transferMode)) {
      return NextResponse.json({ error: "Invalid transfer_mode" }, { status: 400 });
    }
    if (transferMode === "campaign" && !campaignId) {
      return NextResponse.json(
        { error: "campaign_id is required for campaign transfer" },
        { status: 400 }
      );
    }
    if (transferMode === "selected" && leadIds.length === 0) {
      return NextResponse.json(
        { error: "lead_ids is required for selected transfer" },
        { status: 400 }
      );
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const teamContext = await fetchTeamContext(admin, orgId);
    const agentsUnderTl = getAgentsUnderTl(
      teamContext.users,
      teamContext.campaignTlByCampaign,
      teamContext.assignments,
      user.id
    );

    if (!agentBelongsToTl(fromAgentId, user.id, agentsUnderTl)) {
      return NextResponse.json(
        { error: "Source agent is not under your team" },
        { status: 403 }
      );
    }
    if (!agentBelongsToTl(toAgentId, user.id, agentsUnderTl)) {
      return NextResponse.json(
        { error: "Target agent is not under your team" },
        { status: 403 }
      );
    }

    const fromAgent = agentsUnderTl.find((a) => a.id === fromAgentId);
    const toAgent = agentsUnderTl.find((a) => a.id === toAgentId);

    if (!fromAgent || !toAgent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    if (fromAgent.status !== "inactive") {
      return NextResponse.json(
        { error: "Only inactive agent leads can be transferred" },
        { status: 400 }
      );
    }
    if (toAgent.status !== "active") {
      return NextResponse.json(
        { error: "Cannot transfer leads to an inactive agent" },
        { status: 400 }
      );
    }

    let leadsQuery = admin
      .from("leads")
      .select("id, campaign_id, assigned_agent_id, rep_id")
      .eq("organization_id", orgId)
      .eq("assigned_agent_id", fromAgentId);

    if (transferMode === "campaign" && campaignId) {
      leadsQuery = leadsQuery.eq("campaign_id", campaignId);
    } else if (transferMode === "selected") {
      leadsQuery = leadsQuery.in("id", leadIds);
    }

    const { data: leadsData, error: leadsError } = await leadsQuery;
    if (leadsError) {
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    const leads = (leadsData ?? []) as LeadRow[];
    if (leads.length === 0) {
      return NextResponse.json({ error: "No leads found to transfer" }, { status: 400 });
    }

    if (transferMode === "selected") {
      const foundIds = new Set(leads.map((l) => l.id));
      const missing = leadIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: "Some selected leads were not found or are not assigned to the source agent" },
          { status: 400 }
        );
      }
    }

    const transferredLeadIds = leads.map((l) => l.id);
    const now = new Date().toISOString();

    const { data: historyRow, error: historyError } = await admin
      .from("lead_transfer_history")
      .insert({
        organization_id: orgId,
        lead_id: transferredLeadIds.length === 1 ? transferredLeadIds[0] : null,
        lead_count: transferredLeadIds.length,
        lead_ids: transferredLeadIds,
        campaign_id: transferMode === "campaign" ? campaignId ?? null : null,
        from_agent_id: fromAgentId,
        to_agent_id: toAgentId,
        transferred_by_tl_id: user.id,
        transfer_mode: transferMode,
        transferred_at: now,
        notes: notes || null,
      } as never)
      .select("id")
      .single();

    if (historyError || !historyRow) {
      return NextResponse.json(
        { error: historyError?.message ?? "Failed to create transfer history" },
        { status: 500 }
      );
    }

    const transferHistoryId = (historyRow as { id: string }).id;

    const { error: updateError } = await admin
      .from("leads")
      .update({
        assigned_agent_id: toAgentId,
        rep_id: toAgentId,
        updated_at: now,
      } as never)
      .in("id", transferredLeadIds)
      .eq("organization_id", orgId)
      .eq("assigned_agent_id", fromAgentId);

    if (updateError) {
      await admin.from("lead_transfer_history").delete().eq("id", transferHistoryId);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const historyInserts = leads.map((lead) => ({
      lead_id: lead.id,
      changed_by: user.id,
      change_type: "agent_transfer",
      old_value: {
        assigned_agent_id: fromAgentId,
        rep_id: lead.rep_id ?? fromAgentId,
        original_agent_id: fromAgentId,
      },
      new_value: {
        assigned_agent_id: toAgentId,
        rep_id: toAgentId,
      },
      trigger_source: "manual",
      reason_code: "tl_lead_transfer",
      reason: `Lead transferred by TL from ${displayAgentName(fromAgent)} to ${displayAgentName(toAgent)}`,
      metadata: {
        transfer_history_id: transferHistoryId,
        transferred_by_tl_id: user.id,
        original_agent_id: fromAgentId,
        from_agent_id: fromAgentId,
        to_agent_id: toAgentId,
        transfer_mode: transferMode,
        campaign_id: transferMode === "campaign" ? campaignId : lead.campaign_id,
        notes: notes || null,
      },
    }));

    const { error: auditError } = await admin
      .from("lead_history")
      .insert(historyInserts as never);

    if (auditError) {
      console.error("Lead history insert failed after transfer:", auditError.message);
    }

    const fromLabel = displayAgentName(fromAgent);
    const toLabel = displayAgentName(toAgent);
    const tlLabel =
      profileRow?.full_name?.trim() ||
      profileRow?.email?.trim() ||
      "Your Team Leader";

    void createNotification({
      title: "Leads transferred to you",
      message: `${transferredLeadIds.length} lead(s) from ${fromLabel} have been transferred to you by ${tlLabel}.`,
      type: "lead",
      sender_id: user.id,
      receiver_id: toAgentId,
      reference_type: "lead",
      reference_id: transferredLeadIds[0] ?? null,
      organization_id: orgId,
    });

    return NextResponse.json({
      success: true,
      transfer_id: transferHistoryId,
      leads_transferred: transferredLeadIds.length,
      from_agent_id: fromAgentId,
      to_agent_id: toAgentId,
    });
  } catch (err) {
    console.error("Lead transfer error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
