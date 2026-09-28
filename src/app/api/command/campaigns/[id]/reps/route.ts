import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getProfile, getRoleNames } from "@/lib/command/db";
import {
  buildClientViewerCampaignScope,
  guardClientViewerCampaign,
} from "@/lib/command/client-viewer-scope";

export const dynamic = "force-dynamic";

type CampaignAssignmentAgentRow = { agent_id: string };
type LeadAssignedAgentRow = { assigned_agent_id: string | null };
type UserRepRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  agent_code: string | null;
  employee_id: string | null;
};

/** Agents assigned to the campaign (for Leads tab Rep filter). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  if (!hasCommandRole(userRoles) && !userRoles.includes("client_viewer")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getProfile(supabase, user.id);

  let campQuery = supabase.from("campaigns").select("id").eq("id", campaignId);
  if (userRoles.includes("client_viewer")) {
    const scope = buildClientViewerCampaignScope(user.email, profile?.client_id ?? null);
    const allowed = await guardClientViewerCampaign(supabase, scope, campaignId);
    if (!allowed) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
  } else {
    const { data: camp, error: campErr } = await campQuery.single();
    if (campErr || !camp) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
  }

  const { data: assignments, error: asgErr } = (await supabase
    .from("campaign_assignments")
    .select("agent_id")
    .eq("campaign_id", campaignId)
    .eq("is_active", true)) as {
    data: CampaignAssignmentAgentRow[] | null;
    error: { message: string } | null;
  };

  if (asgErr) {
    return NextResponse.json({ error: asgErr.message }, { status: 500 });
  }

  let agentIds = [...new Set((assignments ?? []).map((a) => a.agent_id))];

  if (agentIds.length === 0) {
    const { data: leadAgents } = (await supabase
      .from("leads")
      .select("assigned_agent_id")
      .eq("campaign_id", campaignId)
      .not("assigned_agent_id", "is", null)) as {
      data: LeadAssignedAgentRow[] | null;
    };
    agentIds = [
      ...new Set(
        (leadAgents ?? [])
          .map((r) => r.assigned_agent_id as string | null)
          .filter((id): id is string => Boolean(id))
      ),
    ];
  }

  if (agentIds.length === 0) {
    return NextResponse.json({ reps: [] as { id: string; label: string; rep_id: string | null }[] });
  }

  const { data: users, error: uErr } = (await supabase
    .from("users")
    .select("id, full_name, email, agent_code, employee_id")
    .in("id", agentIds)) as {
    data: UserRepRow[] | null;
    error: { message: string } | null;
  };

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  const reps = (users ?? []).map((u) => {
    const id = u.id;
    const name = u.full_name?.trim() || u.email?.trim() || id;
    const code = u.agent_code?.trim() || u.employee_id?.trim();
    const label = code ? `${name} (${code})` : name;
    return { id, label, rep_id: code ?? null };
  });
  reps.sort((a, b) => a.label.localeCompare(b.label));

  return NextResponse.json({ reps });
}
