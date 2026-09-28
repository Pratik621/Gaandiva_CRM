import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getProfile, getRoleNames } from "@/lib/command/db";
import {
  buildClientViewerCampaignScope,
  applyClientViewerCampaignListScope,
  clientViewerScopeHasAccess,
} from "@/lib/command/client-viewer-scope";
import {
  buildOverviewPayload,
  type OverviewCampaignRow,
  type OverviewHistoryRow,
  type OverviewLeadRow,
  type OverviewMetricsRow,
  type OverviewReportRow,
} from "@/lib/command/overview-aggregation";

export const dynamic = "force-dynamic";

const EMPTY_OVERVIEW = {
  kpis: { totalCampaigns: 0, totalLeads: 0, qualified: 0, registrations: 0, attendees: 0 },
  metrics: {
    total_leads_allocated: 0,
    total_campaign_spend: 0,
    total_leads_delivered: 0,
    deficit_leads: 0,
    lead_increment: 0,
    lead_replace: 0,
  },
  funnel: { leads: 0, qa: 0, qualified: 0, registered: 0, attended: 0 },
  bar: { registrations: 0, attendees: 0 },
  channelSplit: [] as Array<{ name: string; value: number }>,
  channelSplitDaily: [] as Array<{
    date: string;
    campaignName: string;
    email: number;
    telemarketing: number;
  }>,
  trendDaily: [] as Array<{
    date: string;
    leads_delivered: number;
    spend: number;
    deficit: number;
  }>,
  performance: { deliveryRate: 0, deficitRate: 0, registrationRate: 0, attendanceRate: 0 },
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await getRoleNames(supabase, user.id);
  const isAllowed = hasCommandRole(roles) || roles.includes("client_viewer");
  if (!isAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profile = await getProfile(supabase, user.id);
  const campaignIdParam = request.nextUrl.searchParams.get("campaign_id");
  const isClientViewer = roles.includes("client_viewer");

  let campaignsQuery = supabase
    .from("campaigns")
    .select("id, name, campaign_id, client_id, total_allocation, achieved")
    .eq("organization_id", profile?.organization_id ?? "");

  if (isClientViewer) {
    const clientViewerScope = buildClientViewerCampaignScope(
      user.email,
      profile?.client_id ?? null
    );
    if (!clientViewerScopeHasAccess(clientViewerScope)) {
      return NextResponse.json({
        campaigns: [],
        selectedCampaignId: campaignIdParam ?? null,
        ...EMPTY_OVERVIEW,
      });
    }
    campaignsQuery = applyClientViewerCampaignListScope(campaignsQuery, clientViewerScope);
  }

  if (campaignIdParam) campaignsQuery = campaignsQuery.eq("id", campaignIdParam);

  const { data: campaigns, error: campaignsErr } = await campaignsQuery.order("created_at", {
    ascending: false,
  });
  if (campaignsErr) return NextResponse.json({ error: campaignsErr.message }, { status: 500 });

  const campaignRows = (campaigns ?? []) as OverviewCampaignRow[];
  const campaignIds = campaignRows.map((c) => c.id);

  if (campaignIds.length === 0) {
    return NextResponse.json({
      campaigns: campaignRows,
      selectedCampaignId: campaignIdParam ?? null,
      ...EMPTY_OVERVIEW,
      kpis: { ...EMPTY_OVERVIEW.kpis, totalCampaigns: campaignRows.length },
    });
  }

  let leadsQuery = supabase
    .from("leads")
    .select(
      "created_at, delivered_at, delivery_status, channel, qa_status, registered_at, appointment, campaign_id, campaigns(name)"
    )
    .in("campaign_id", campaignIds);
  if (isClientViewer) {
    leadsQuery = leadsQuery.eq("delivery_status", "delivered");
  }

  const [
    { data: metricsData, error: metricsErr },
    { data: leadsData, error: leadsErr },
    { data: historyData, error: historyErr },
    { data: reportData, error: reportErr },
  ] = await Promise.all([
    supabase
      .from("campaign_metrics")
      .select(
        "campaign_id,total_leads,total_leads_allocated,total_campaign_spend,total_leads_delivered,deficit_leads,lead_increment,lead_replace,daily_reporting,qa_pending_count,qualified_count,registered_count,attended_count,channel_split"
      )
      .in("campaign_id", campaignIds),
    leadsQuery,
    supabase
      .from("campaign_metrics_history")
      .select(
        "campaign_id,date,total_leads_delivered,total_campaign_spend,deficit_leads,channel_split,created_at"
      )
      .in("campaign_id", campaignIds)
      .order("date", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_performance_reports")
      .select(
        "crm_campaign_uuid,start_date,end_date,outbound_data,landing_page_data,poc_clicks_data"
      )
      .in("crm_campaign_uuid", campaignIds),
  ]);

  if (metricsErr) return NextResponse.json({ error: metricsErr.message }, { status: 500 });
  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  if (historyErr) return NextResponse.json({ error: historyErr.message }, { status: 500 });
  if (reportErr) return NextResponse.json({ error: reportErr.message }, { status: 500 });

  const overview = buildOverviewPayload({
    campaignRows,
    metricsRows: (metricsData ?? []) as OverviewMetricsRow[],
    leadRows: (leadsData ?? []) as OverviewLeadRow[],
    historyRows: (historyData ?? []) as OverviewHistoryRow[],
    reportRows: (reportData ?? []) as OverviewReportRow[],
    isClientViewer,
  });

  return NextResponse.json({
    campaigns: campaignRows.map(({ id, name, campaign_id }) => ({ id, name, campaign_id })),
    selectedCampaignId: campaignIdParam ?? null,
    ...overview,
  });
}
