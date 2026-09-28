import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import {
  buildMisDashboardAggregates,
  fetchMisDashboardLeads,
} from "@/lib/mis/dashboard-stats";

export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  campaign_code: string | null;
};

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

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);
    const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[]).map((r) =>
      r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_")
    );
    const canViewMisDashboard = roleNames.includes("mis") || roleNames.includes("admin");
    if (!canViewMisDashboard) {
      return NextResponse.json({ error: "Forbidden: MIS or Admin role required" }, { status: 403 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data: campaignsData, error: campaignsError } = await admin
      .from("campaigns")
      .select("id, name, status, campaign_code")
      .eq("organization_id", orgId);

    if (campaignsError) {
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    const campaigns = (campaignsData ?? []) as CampaignRow[];
    const campaignIds = campaigns.map((c) => c.id);
    const leads = await fetchMisDashboardLeads(admin, orgId, campaignIds);
    const aggregates = buildMisDashboardAggregates(leads, campaigns);

    const agentIds = aggregates.agentDistribution
      .map((row) => row.agent_id)
      .filter((id): id is string => !!id);

    let agentNames: Record<string, string> = {};
    if (agentIds.length > 0) {
      const { data: usersData } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", agentIds);
      (usersData ?? []).forEach((u: { id: string; full_name: string | null; email: string | null }) => {
        agentNames[u.id] = u.full_name || u.email || "Unknown";
      });
    }

    const agentDistribution = aggregates.agentDistribution.map((row) => ({
      ...row,
      agent_name: row.agent_id ? agentNames[row.agent_id] ?? "Unknown" : "Unassigned",
    }));

    return NextResponse.json({
      stats: aggregates.stats,
      dailyUploads: aggregates.dailyUploads,
      campaignPerformance: aggregates.campaignPerformance,
      leadStatus: aggregates.leadStatus,
      agentDistribution,
    });
  } catch (err) {
    console.error("MIS dashboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
