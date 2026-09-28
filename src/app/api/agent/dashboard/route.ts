import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import {
  buildAgentCampaignLeadBars,
  buildAgentCompletionPredictions,
  buildAgentLeadTrend,
  fetchCampaignTeamLeadStats,
  summarizeAgentLeads,
  type AgentLeadRow,
} from "@/lib/agent-dashboard-metrics";
import { isBillableLeadStatus } from "@/lib/leads/billable-status";

export const dynamic = "force-dynamic";

const LEADS_PAGE_SIZE = 1000;

async function fetchLeadRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignIds: string[],
  agentId?: string
): Promise<AgentLeadRow[]> {
  if (campaignIds.length === 0) return [];

  const all: AgentLeadRow[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("leads")
      .select("campaign_id, status, qa_status, billable_status, created_at")
      .in("campaign_id", campaignIds);

    if (agentId) {
      query = query.eq("assigned_agent_id", agentId);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + LEADS_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const chunk = (data ?? []) as AgentLeadRow[];
    all.push(...chunk);
    if (chunk.length < LEADS_PAGE_SIZE) break;
    offset += LEADS_PAGE_SIZE;
  }

  return all;
}

/**
 * Agent dashboard: assigned campaigns, lead metrics, chart data, completion predictions.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "10", 10), 1), 50);

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

    const { data: assignments, error: assignmentsError } = await supabase
      .from("campaign_assignments")
      .select("campaign_id")
      .eq("agent_id", user.id)
      .eq("is_active", true);

    if (assignmentsError) {
      return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
    }

    const campaignIds = [
      ...new Set(((assignments ?? []) as { campaign_id: string }[]).map((a) => a.campaign_id)),
    ];

    const emptyPayload = {
      summary: {
        totalCampaigns: 0,
        activeCampaigns: 0,
        totalLeads: 0,
        activeLeads: 0,
        pendingLeads: 0,
        qualifiedLeads: 0,
        disqualifiedLeads: 0,
        qualifiedRatePct: 0,
        billableLeads: 0,
      },
      leadTrend: [],
      campaignLeads: [],
      completionPredictions: [],
      recentCampaigns: [],
    };

    if (campaignIds.length === 0) {
      return NextResponse.json(emptyPayload);
    }

    const { data: campaignsData, error: campaignsError } = await supabase
      .from("campaigns")
      .select(
        "id, campaign_id, campaign_code, name, client_name, industry, geography, status, start_date, end_date, total_allocation, created_at"
      )
      .eq("organization_id", orgId)
      .in("id", campaignIds)
      .order("created_at", { ascending: false });

    if (campaignsError) {
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    const campaigns = (campaignsData ?? []) as {
      id: string;
      campaign_id: string | null;
      campaign_code: string | null;
      name: string;
      client_name: string | null;
      industry: string | null;
      geography: string | null;
      status: string;
      start_date: string | null;
      end_date: string | null;
      total_allocation: number | null;
      created_at: string;
    }[];

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const [agentLeads, campaignStats] = await Promise.all([
      fetchLeadRows(supabase, campaignIds, user.id),
      fetchCampaignTeamLeadStats(admin, orgId, campaignIds),
    ]);

    const leadSummary = summarizeAgentLeads(agentLeads);
    const activeLeads = agentLeads.filter((l) => {
      const st = String((l as { status?: string }).status ?? "").trim().toLowerCase();
      return st === "interested" || st === "followup";
    }).length;

    const leadsByCampaign: Record<
      string,
      { total: number; active: number; won: number; qualified: number; billable: number }
    > = {};
    for (const l of agentLeads) {
      if (!leadsByCampaign[l.campaign_id]) {
        leadsByCampaign[l.campaign_id] = { total: 0, active: 0, won: 0, qualified: 0, billable: 0 };
      }
      const b = leadsByCampaign[l.campaign_id];
      b.total += 1;
      const st = String((l as { status?: string }).status ?? "").trim().toLowerCase();
      if (st === "interested" || st === "followup") b.active += 1;
      if (st === "closed_won") b.won += 1;
      const qa = String(l.qa_status ?? "").trim().toLowerCase();
      if (qa === "qualified" || qa === "approved" || qa === "pass") b.qualified += 1;
      if (isBillableLeadStatus(l.billable_status)) b.billable += 1;
    }

    const totalCampaigns = campaignIds.length;
    const activeCampaigns = campaigns.filter((c) => c.status === "active").length;

    const recentCampaigns = campaigns.slice(0, limit).map((c) => ({
      ...c,
      total_leads: leadsByCampaign[c.id]?.total ?? 0,
      active_leads: leadsByCampaign[c.id]?.active ?? 0,
      won_leads: leadsByCampaign[c.id]?.won ?? 0,
      qualified_leads: leadsByCampaign[c.id]?.qualified ?? 0,
    }));

    return NextResponse.json({
      summary: {
        totalCampaigns,
        activeCampaigns,
        totalLeads: leadSummary.totalLeads,
        activeLeads,
        pendingLeads: leadSummary.pendingLeads,
        qualifiedLeads: leadSummary.qualifiedLeads,
        disqualifiedLeads: leadSummary.disqualifiedLeads,
        qualifiedRatePct: leadSummary.qualifiedRatePct,
        billableLeads: leadSummary.billableLeads,
      },
      leadTrend: buildAgentLeadTrend(agentLeads),
      campaignLeads: buildAgentCampaignLeadBars(campaigns, agentLeads),
      completionPredictions: buildAgentCompletionPredictions(
        campaigns,
        agentLeads,
        campaignStats
      ),
      recentCampaigns,
    });
  } catch (err) {
    console.error("Agent dashboard error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
