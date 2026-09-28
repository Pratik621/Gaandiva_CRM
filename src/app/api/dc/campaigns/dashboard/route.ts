import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DC_CLIENT_NAME = "DC";

async function verifyDC(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name")
    .eq("organization_id", orgId);
  const dcRoles = ((roles ?? []) as { id: string; name: string | null }[]).filter(
    (r) => r.name?.toLowerCase() === "dc"
  );
  if (dcRoles.length === 0) return false;
  const { data: ur } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .in("role_id", dcRoles.map((r) => r.id));
  return (ur ?? []).length > 0;
}

function normalizeDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDailySeries<T>(
  items: T[],
  getDate: (item: T) => string | null | undefined,
  startDate: Date,
  days: number
) {
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    counts.set(normalizeDateKey(date), 0);
  }

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + days);

  items.forEach((item) => {
    const created = getDate(item);
    if (!created) return;
    const parsed = new Date(created);
    if (Number.isNaN(parsed.getTime())) return;
    if (parsed < startDate || parsed >= endDate) return;
    const key = normalizeDateKey(parsed);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries()).map(([date, value]) => ({ date, value }));
}

function computeTrendLabel(previous: number, current: number) {
  if (previous === 0) {
    if (current === 0) return "0% from last 7 days";
    return "+100% from last 7 days";
  }
  const diff = current - previous;
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  return `${diff >= 0 ? "+" : "-"}${pct}% from last 7 days`;
}

const emptyTrends = {
  campaigns: { change: "0% from last 7 days", series: [] as { date: string; value: number }[] },
  leads: { change: "0% from last 7 days", series: [] as { date: string; value: number }[] },
  qualifiedLeads: { change: "0% from last 7 days", series: [] as { date: string; value: number }[] },
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const isDC = await verifyDC(supabase, user.id, orgId);
    if (!isDC) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });

    const { data: allCamps } = await admin
      .from("campaigns")
      .select("id, name, client_name, client_id")
      .eq("organization_id", orgId);

    type CampRow = { id: string; name: string; client_name: string | null; client_id: string | null };
    const camps = (allCamps ?? []) as CampRow[];

    const clientIds = [...new Set(camps.map((c) => c.client_id).filter(Boolean))] as string[];
    const clientNameById: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: clients } = await admin
        .from("clients")
        .select("id, company_name")
        .in("id", clientIds);
      ((clients ?? []) as { id: string; company_name: string }[]).forEach((cl) => {
        clientNameById[cl.id] = cl.company_name;
      });
    }

    const matched = camps.filter((c) => {
      const direct = (c.client_name ?? "").trim().toLowerCase() === DC_CLIENT_NAME.toLowerCase();
      const viaClient = c.client_id
        ? (clientNameById[c.client_id] ?? "").trim().toLowerCase() === DC_CLIENT_NAME.toLowerCase()
        : false;
      return direct || viaClient;
    });

    const campaignIds = matched.map((c) => c.id);

    const distinctClientNames = [
      ...new Set([
        ...camps.map((c) => c.client_name).filter(Boolean),
        ...Object.values(clientNameById),
      ]),
    ];
    const debug = {
      orgId,
      totalCampaignsInOrg: camps.length,
      distinctClientNames,
      searchingFor: DC_CLIENT_NAME,
      matchedCount: campaignIds.length,
    };

    if (campaignIds.length === 0) {
      return NextResponse.json({
        totalCampaigns: 0,
        totalLeads: 0,
        qualifiedLeads: 0,
        campaignStatus: { active: 0, completed: 0, paused: 0 },
        trends: emptyTrends,
        recentCampaigns: [],
        _debug: debug,
      });
    }

    const { data: campaignsData } = await admin
      .from("campaigns")
      .select("id, campaign_id, name, status, created_at")
      .in("id", campaignIds)
      .order("created_at", { ascending: false });

    type CampaignItem = {
      id: string;
      campaign_id: string | null;
      name: string;
      status: string;
      created_at: string;
    };
    const campaignRows = (campaignsData ?? []) as CampaignItem[];

    const { data: leadData } = await admin
      .from("leads")
      .select("id, campaign_id, status, qa_status, delivery_status, lead_tagging, created_at")
      .in("campaign_id", campaignIds);

    type LeadRow = {
      id: string;
      campaign_id: string;
      status: string | null;
      qa_status: string | null;
      delivery_status: string | null;
      lead_tagging: string | null;
      created_at: string | null;
    };
    const leadRows = (leadData ?? []) as LeadRow[];

    const isQualified = (l: LeadRow) => {
      const qa = (l.qa_status ?? "").trim().toLowerCase();
      const status = (l.status ?? "").trim().toLowerCase();
      return (
        status === "qualified" ||
        qa === "qualified" ||
        qa === "approved" ||
        qa === "pass"
      );
    };

    const totalLeads = leadRows.length;
    const qualifiedLeads = leadRows.filter(isQualified).length;

    const campaignStatusCounts = campaignRows.reduce(
      (acc, campaign) => {
        const status = (campaign.status ?? "").trim().toLowerCase();
        if (status === "active") acc.active += 1;
        if (status === "completed") acc.completed += 1;
        if (status === "paused") acc.paused += 1;
        return acc;
      },
      { active: 0, completed: 0, paused: 0 }
    );

    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const lookbackDays = 14;
    const lookbackStart = new Date(dayStart);
    lookbackStart.setDate(dayStart.getDate() - (lookbackDays - 1));

    const campaignSeries = buildDailySeries(campaignRows, (item) => item.created_at, lookbackStart, lookbackDays);
    const leadSeries = buildDailySeries(leadRows, (item) => item.created_at, lookbackStart, lookbackDays);
    const qualifiedLeadSeries = buildDailySeries(
      leadRows.filter(isQualified),
      (item) => item.created_at,
      lookbackStart,
      lookbackDays
    );

    const seriesLast7 = (series: { date: string; value: number }[]) => series.slice(-7);
    const seriesFirst7 = (series: { date: string; value: number }[]) => series.slice(0, 7);
    const sumSeries = (series: { value: number }[]) => series.reduce((total, item) => total + item.value, 0);

    const recentCampaignSeries = seriesLast7(campaignSeries);
    const recentLeadSeries = seriesLast7(leadSeries);
    const recentQualifiedSeries = seriesLast7(qualifiedLeadSeries);

    const campaignsPrev7 = sumSeries(seriesFirst7(campaignSeries));
    const campaignsLast7 = sumSeries(recentCampaignSeries);
    const leadsPrev7 = sumSeries(seriesFirst7(leadSeries));
    const leadsLast7 = sumSeries(recentLeadSeries);
    const qualifiedPrev7 = sumSeries(seriesFirst7(qualifiedLeadSeries));
    const qualifiedLast7 = sumSeries(recentQualifiedSeries);

    const campaignStats: Record<string, { total: number; qualified: number }> = {};
    leadRows.forEach((lead) => {
      if (!campaignStats[lead.campaign_id]) {
        campaignStats[lead.campaign_id] = { total: 0, qualified: 0 };
      }
      campaignStats[lead.campaign_id].total += 1;
      if (isQualified(lead)) campaignStats[lead.campaign_id].qualified += 1;
    });

    const recentCampaigns = campaignRows.slice(0, 5).map((campaign) => ({
      id: campaign.id,
      campaign_id: campaign.campaign_id,
      name: campaign.name,
      status: campaign.status,
      created_at: campaign.created_at,
      total_leads: campaignStats[campaign.id]?.total ?? 0,
      qualified_leads: campaignStats[campaign.id]?.qualified ?? 0,
    }));

    return NextResponse.json({
      totalCampaigns: campaignIds.length,
      totalLeads,
      qualifiedLeads,
      campaignStatus: campaignStatusCounts,
      trends: {
        campaigns: {
          change: computeTrendLabel(campaignsPrev7, campaignsLast7),
          series: recentCampaignSeries,
        },
        leads: {
          change: computeTrendLabel(leadsPrev7, leadsLast7),
          series: recentLeadSeries,
        },
        qualifiedLeads: {
          change: computeTrendLabel(qualifiedPrev7, qualifiedLast7),
          series: recentQualifiedSeries,
        },
      },
      recentCampaigns,
      _debug: debug,
    });
  } catch (err) {
    console.error("DC dashboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
