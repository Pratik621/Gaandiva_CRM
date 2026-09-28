import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { hasOrgWideCampaignAccess } from "@/lib/auth/tl-access";
import { isUserAssignedToCampaignAsTeamLeader } from "@/lib/campaign/team-leader-assignments";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
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

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, assigned_team_leader_id")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const camp = campaign as { id: string; assigned_team_leader_id?: string | null };
    const tlAssigned = await isUserAssignedToCampaignAsTeamLeader(
      supabase,
      campaignId,
      user.id,
      camp.assigned_team_leader_id ?? null
    );
    if (!hasOrgWideCampaignAccess(roleNames) && !tlAssigned) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const { data: logs, error: logsError } = await (getAdminClientSafe() ?? supabase)
      .from("campaign_logs")
      .select("id, campaign_id, action, message, created_by, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (logsError) {
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    return NextResponse.json({ logs: logs ?? [] });
  } catch (err) {
    console.error("Fetch campaign logs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
