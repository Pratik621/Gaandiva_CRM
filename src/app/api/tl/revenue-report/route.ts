import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import {
  aggregateRevenueReportSummary,
  buildRevenueByCampaignChart,
  buildRevenueByTeamLeaderChart,
  buildRevenueByLeadTypeChart,
} from "@/lib/campaign-revenue-metrics";
import {
  applyRevenueReportChannelFilter,
  buildMonthlyRevenueTrendFromPeriod,
  canAccessRevenueReport,
  fetchRevenueReportFilterOptions,
  fetchRevenueReportRows,
  groupRevenueReportByClient,
  parseRevenueReportFilters,
  resolveRevenueReportCampaignIds,
  sortRevenueReportRows,
} from "@/lib/revenue-report/query";

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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    if (!canAccessRevenueReport(roleNames)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id, client_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null; client_id: string | null } | null)
      ?.organization_id;
    const clientId = (profile as { client_id: string | null } | null)?.client_id ?? null;

    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const filters = parseRevenueReportFilters(request.nextUrl.searchParams);
    const { page, limit, offset } = parseListPagination(request.nextUrl.searchParams);

    const filterOptionCampaignIds = await resolveRevenueReportCampaignIds(
      supabase,
      orgId,
      user.id,
      roleNames,
      clientId,
      filters
    );

    const campaignIds = filterOptionCampaignIds;

    const periodOptions = {
      date_from: filters.date_from!,
      date_to: filters.date_to!,
      activityOnly: true,
    };

    const { rows: fetchedRows, monthlyRevenue } = await fetchRevenueReportRows(
      supabase,
      orgId,
      campaignIds,
      periodOptions
    );

    const allRows = applyRevenueReportChannelFilter(
      sortRevenueReportRows(fetchedRows, filters.sort_by, filters.sort_dir ?? "desc"),
      filters.channel
    );

    const clientGroups = groupRevenueReportByClient(allRows);
    const total = clientGroups.length;
    const pageClients = clientGroups.slice(offset, offset + limit);
    const pageRows = pageClients.flatMap((g) => g.campaigns);

    const summary = aggregateRevenueReportSummary(allRows.map((r) => r.metrics));

    const charts = {
      revenueByCampaign: buildRevenueByCampaignChart(
        allRows.map((r) => ({ name: r.name, revenue: r.metrics.revenue }))
      ),
      revenueByTeamLeader: buildRevenueByTeamLeaderChart(
        allRows.map((r) => ({
          team_leader_name: r.assigned_team_leader_name,
          revenue: r.metrics.revenue,
        }))
      ),
      revenueByLeadType: buildRevenueByLeadTypeChart(
        allRows.map((r) => ({ lead_type: r.lead_type, revenue: r.metrics.revenue }))
      ),
      monthlyRevenueTrend: buildMonthlyRevenueTrendFromPeriod(monthlyRevenue),
    };

    const filterOptions = await fetchRevenueReportFilterOptions(
      supabase,
      orgId,
      filterOptionCampaignIds
    );

    return NextResponse.json({
      clients: pageClients,
      campaigns: pageRows,
      summary,
      charts,
      filterOptions,
      period: {
        period: filters.period,
        date_from: filters.date_from,
        date_to: filters.date_to,
        label: filters.label,
      },
      pagination: buildPaginationMeta(page, limit, total),
    });
  } catch (err) {
    console.error("Revenue report error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
