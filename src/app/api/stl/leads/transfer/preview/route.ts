import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import {
  agentBelongsToStl,
  fetchStlTeamContext,
  getAgentsUnderStl,
} from "@/lib/stl/lead-transfer";
import { fetchTransferPreview, type TransferAgentOption } from "@/lib/tl/lead-transfer";

export const dynamic = "force-dynamic";

/**
 * GET /api/stl/leads/transfer/preview?from_agent_id=...
 * Preview lead counts and active agents for transfer modal.
 */
export async function GET(request: Request) {
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
    const isSTL = roleNames.some((n) => isSeniorTeamLeaderRole(n));
    if (!isSTL) {
      return NextResponse.json(
        { error: "Only Senior Team Leaders can transfer leads" },
        { status: 403 }
      );
    }

    const fromAgentId = new URL(request.url).searchParams.get("from_agent_id")?.trim() ?? "";
    if (!fromAgentId) {
      return NextResponse.json({ error: "from_agent_id is required" }, { status: 400 });
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

    const teamContext = await fetchStlTeamContext(admin, orgId);
    const agentsUnderStl = getAgentsUnderStl(
      teamContext.users,
      teamContext.campaignStlByCampaign,
      teamContext.assignments,
      user.id
    );

    if (!agentBelongsToStl(fromAgentId, user.id, agentsUnderStl)) {
      return NextResponse.json(
        { error: "Agent is not under your team" },
        { status: 403 }
      );
    }

    const fromAgent = agentsUnderStl.find((a) => a.id === fromAgentId);
    if (!fromAgent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    if (fromAgent.status !== "inactive") {
      return NextResponse.json(
        { error: "Only inactive agent leads can be transferred" },
        { status: 400 }
      );
    }

    const activeAgents = agentsUnderStl.filter(
      (a) => a.status === "active" && a.id !== fromAgentId
    );

    const preview = await fetchTransferPreview(admin, orgId, fromAgentId);

    const activeWithCounts: TransferAgentOption[] = await Promise.all(
      activeAgents.map(async (agent) => ({
        ...agent,
        lead_count: 0,
      }))
    );

    return NextResponse.json({
      from_agent: fromAgent,
      active_agents: activeWithCounts,
      total_leads: preview.total_leads,
      campaigns: preview.campaigns,
    });
  } catch (err) {
    console.error("Transfer preview error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
