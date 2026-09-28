import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import {
  fetchStlTeamContext,
  getAgentsUnderStl,
} from "@/lib/stl/lead-transfer";
import { countLeadsForAgent } from "@/lib/tl/lead-transfer";

export const dynamic = "force-dynamic";

/**
 * GET /api/stl/leads/transfer/eligible-agents
 * Inactive agents under the current STL that have leads to transfer.
 */
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
    const isSTL = roleNames.some((n) => isSeniorTeamLeaderRole(n));
    if (!isSTL) {
      return NextResponse.json({ agents: [] });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ agents: [] });
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

    const inactiveAgents = agentsUnderStl.filter((a) => a.status === "inactive");

    const agentsWithCounts = await Promise.all(
      inactiveAgents.map(async (agent) => ({
        ...agent,
        lead_count: await countLeadsForAgent(admin, orgId, agent.id),
      }))
    );

    return NextResponse.json({
      agents: agentsWithCounts.filter((a) => a.lead_count > 0),
    });
  } catch (err) {
    console.error("Eligible agents error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
