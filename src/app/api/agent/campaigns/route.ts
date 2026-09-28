import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import { isBillableLeadStatus } from "@/lib/leads/billable-status";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

    const { page, limit, offset } = parseListPagination(request.nextUrl.searchParams);
    const statusFilter = request.nextUrl.searchParams.get("status")?.trim() || null;
    const searchRaw = request.nextUrl.searchParams.get("q")?.trim() || "";

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
    if (campaignIds.length === 0) {
      return NextResponse.json({
        campaigns: [],
        pagination: buildPaginationMeta(page, limit, 0),
      });
    }

    let campaignsQuery = supabase
      .from("campaigns")
      .select(
        "id, campaign_id, campaign_code, name, client_name, description, industry, geography, lead_type, status, start_date, end_date, created_at",
        { count: "exact" }
      )
      .eq("organization_id", orgId)
      .in("id", campaignIds);

    if (statusFilter) {
      campaignsQuery = campaignsQuery.eq("status", statusFilter);
    }
    if (searchRaw.length > 0) {
      const safe = searchRaw.replace(/%/g, "").replace(/_/g, "");
      if (safe.length > 0) {
        campaignsQuery = campaignsQuery.or(
          `name.ilike.%${safe}%,campaign_code.ilike.%${safe}%,industry.ilike.%${safe}%`
        );
      }
    }

    const { data: campaigns, error: campaignsError, count } = await campaignsQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (campaignsError) {
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    type CampaignRow = {
      id: string;
      campaign_id: string | null;
      campaign_code: string | null;
      name: string;
      client_name: string | null;
      description: string | null;
      industry: string | null;
      geography: string | null;
      lead_type: string | null;
      status: string;
      start_date: string | null;
      end_date: string | null;
      created_at: string;
    };
    const campaignsList = (campaigns ?? []) as CampaignRow[];
    const pageCampaignIds = campaignsList.map((c) => c.id);
    const total = count ?? campaignsList.length;

    const leadsByCampaign: Record<
      string,
      { total: number; active: number; won: number; qualified: number; billable: number }
    > = {};
    for (const id of pageCampaignIds) {
      leadsByCampaign[id] = { total: 0, active: 0, won: 0, qualified: 0, billable: 0 };
    }

    if (pageCampaignIds.length > 0) {
      const { data: leadsRes, error: leadsError } = await supabase
        .from("leads")
        .select("campaign_id, status, qa_status, billable_status")
        .in("campaign_id", pageCampaignIds)
        .eq("assigned_agent_id", user.id);

      if (leadsError) {
        return NextResponse.json({ error: leadsError.message }, { status: 500 });
      }

      ((leadsRes ?? []) as {
        campaign_id: string;
        status: string;
        qa_status: string | null;
        billable_status: string | null;
      }[]).forEach(
        (l) => {
          const bucket = leadsByCampaign[l.campaign_id];
          if (!bucket) return;
          bucket.total += 1;
          if (["interested", "followup"].includes(l.status)) bucket.active += 1;
          if (l.status === "closed_won") bucket.won += 1;
          const qa = String(l.qa_status ?? "").trim().toLowerCase();
          if (qa === "qualified" || qa === "approved" || qa === "pass") bucket.qualified += 1;
          if (isBillableLeadStatus(l.billable_status)) bucket.billable += 1;
        }
      );
    }

    const campaignsWithStats = campaignsList.map((c) => ({
      ...c,
      total_leads: leadsByCampaign[c.id]?.total ?? 0,
      active_leads: leadsByCampaign[c.id]?.active ?? 0,
      won_leads: leadsByCampaign[c.id]?.won ?? 0,
      qualified_leads: leadsByCampaign[c.id]?.qualified ?? 0,
      billable_leads_count: leadsByCampaign[c.id]?.billable ?? 0,
    }));

    return NextResponse.json({
      campaigns: campaignsWithStats,
      pagination: buildPaginationMeta(page, limit, total),
    });
  } catch (err) {
    console.error("Agent campaigns error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
