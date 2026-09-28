import { NextResponse } from "next/server";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { chunkIds } from "@/lib/supabase/in-chunks";
import {
  hasTLAccess,
  hasOrgWideInsightsAccess,
  isCampaignTeamLeaderRole,
} from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { isAgentRole } from "@/lib/tl/team-hierarchy";
import { fetchCampaignIdsForTeamLeader } from "@/lib/campaign/team-leader-assignments";
import { chunkArray } from "@/lib/postgrest-filter";

export const dynamic = "force-dynamic";

dayjs.extend(utc);
dayjs.extend(timezone);

const LEADS_PAGE_SIZE = 1000;

function supabaseErrMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

export type DashboardSummaryResponse = {
  scope: "organization" | "team";
  campaigns: {
    total: number;
    active: number;
    paused: number;
    draft: number;
    completed: number;
    ending_today: number;
    ending_this_week: number;
  };
  leads: {
    total: number;
    today: number;
    qualified: number;
    disqualified: number;
    qualification_rate_pct: number;
    today_conversion_rate_pct: number;
  };
  people: {
    total_team_leaders: number;
    total_agents: number;
    active_agents: number;
    inactive_agents: number;
    avg_leads_per_agent: number;
    avg_leads_per_team: number;
  };
};

function isValidTimeZone(tz: string | null): tz is string {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function utcEndOfDayInTz(dateStr: string, tz: string): string {
  return dayjs.tz(`${dateStr} 23:59:59.999`, "YYYY-MM-DD HH:mm:ss.SSS", tz).utc().toISOString();
}

function utcStartOfDayInTz(dateStr: string, tz: string): string {
  return dayjs.tz(`${dateStr} 00:00:00.000`, "YYYY-MM-DD HH:mm:ss.SSS", tz).utc().toISOString();
}

function isQualifiedQa(qa: string | null | undefined): boolean {
  const q = String(qa ?? "").trim().toLowerCase();
  return q === "qualified" || q === "approved" || q === "pass";
}

function isDisqualifiedQa(qa: string | null | undefined): boolean {
  return String(qa ?? "").trim().toLowerCase() === "disqualified";
}

type LeadRow = {
  qa_status: string | null;
  created_at: string;
};

async function fetchLeadsInDateRange(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  orgId: string,
  campaignIds: string[],
  startUtc: string,
  endUtc: string
): Promise<LeadRow[]> {
  if (campaignIds.length === 0) return [];

  const all: LeadRow[] = [];

  // Chunk campaign IDs — a single `.in()` with hundreds of UUIDs overflows HTTP headers.
  for (const idChunk of chunkIds(campaignIds)) {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin
        .from("leads")
        .select("qa_status, created_at")
        .eq("organization_id", orgId)
        .in("campaign_id", idChunk)
        .gte("created_at", startUtc)
        .lte("created_at", endUtc)
        .order("created_at", { ascending: true })
        .range(offset, offset + LEADS_PAGE_SIZE - 1);

      if (error) throw error;
      const page = (data ?? []) as LeadRow[];
      all.push(...page);
      if (page.length < LEADS_PAGE_SIZE) break;
      offset += LEADS_PAGE_SIZE;
    }
  }

  return all;
}

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
    if (!hasTLAccess(roleNames) && !hasOrgWideInsightsAccess(roleNames)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isOM = hasOrgWideInsightsAccess(roleNames);
    const isTL = !isOM && roleNames.some((name) => isCampaignTeamLeaderRole(name));

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

    const url = new URL(request.url);
    const tzParam = url.searchParams.get("tz");
    const appTz = isValidTimeZone(tzParam) ? tzParam : "UTC";
    const today = dayjs().tz(appTz).format("YYYY-MM-DD");
    const startDate = url.searchParams.get("start_date") || today;
    const endDate = url.searchParams.get("end_date") || today;
    const startUtc = utcStartOfDayInTz(startDate, appTz);
    const endUtc = utcEndOfDayInTz(endDate, appTz);
    const weekEnd = dayjs.tz(endDate, "YYYY-MM-DD", appTz).endOf("week").format("YYYY-MM-DD");

    let campaignsQuery = admin
      .from("campaigns")
      .select("id, status, end_date, assigned_team_leader_id")
      .eq("organization_id", orgId);

    if (isTL) {
      const junctionCampaignIds = await fetchCampaignIdsForTeamLeader(supabase, user.id, orgId);
      if (junctionCampaignIds.length > 0) {
        const idList = junctionCampaignIds.map((id) => `"${id}"`).join(",");
        campaignsQuery = campaignsQuery.or(
          `assigned_team_leader_id.eq.${user.id},id.in.(${idList})`
        );
      } else {
        campaignsQuery = campaignsQuery.eq("assigned_team_leader_id", user.id);
      }
    }

    const [{ data: campaigns, error: campaignsError }, { data: allUsers, error: usersError }] =
      await Promise.all([
        campaignsQuery,
        admin
          .from("users")
          .select("id, status, user_roles(roles(name))")
          .eq("organization_id", orgId),
      ]);

    if (campaignsError) {
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }
    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    type CampaignRow = { id: string; status: string; end_date: string | null };
    type OrgUser = {
      id: string;
      status: string;
      user_roles: { roles: { name: string } | null }[] | null;
    };

    const campaignRows = (campaigns ?? []) as CampaignRow[];
    const campaignIds = campaignRows.map((c) => c.id);
    const orgUsers = (allUsers ?? []) as OrgUser[];

    const userIsAgent = (u: OrgUser) =>
      (u.user_roles ?? []).some((r) => isAgentRole(r.roles?.name));
    const userIsTL = (u: OrgUser) =>
      (u.user_roles ?? []).some((r) => isCampaignTeamLeaderRole(r.roles?.name));

    const agents = orgUsers.filter(userIsAgent);
    const activeAgents = agents.filter((u) => u.status === "active");
    const inactiveAgents = agents.length - activeAgents.length;
    const teamLeaders = orgUsers.filter(userIsTL);

    const statusCount = (status: string) =>
      campaignRows.filter((c) => c.status === status).length;

    const endingToday = campaignRows.filter((c) => {
      if (!c.end_date) return false;
      return dayjs(c.end_date).tz(appTz).format("YYYY-MM-DD") === endDate;
    }).length;

    const endingThisWeek = campaignRows.filter((c) => {
      if (!c.end_date) return false;
      const end = dayjs(c.end_date).tz(appTz).format("YYYY-MM-DD");
      return end >= endDate && end <= weekEnd;
    }).length;

    let leads: LeadRow[] = [];
    try {
      leads = await fetchLeadsInDateRange(admin, orgId, campaignIds, startUtc, endUtc);
    } catch (leadsErr) {
      const msg = supabaseErrMessage(leadsErr, "Failed to load leads");
      console.error("TL dashboard summary leads error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const totalLeads = leads.length;
    const todayLeads = leads.filter(
      (l) => dayjs(l.created_at).tz(appTz).format("YYYY-MM-DD") === today
    ).length;
    const qualifiedLeads = leads.filter((l) => isQualifiedQa(l.qa_status)).length;
    const disqualifiedLeads = leads.filter((l) => isDisqualifiedQa(l.qa_status)).length;
    const qualificationRatePct =
      totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;
    const todayConversionRatePct =
      todayLeads > 0
        ? Math.round(
            (leads.filter(
              (l) =>
                dayjs(l.created_at).tz(appTz).format("YYYY-MM-DD") === today &&
                isQualifiedQa(l.qa_status)
            ).length /
              todayLeads) *
              100
          )
        : 0;

    const activeAgentCount = activeAgents.length;
    const tlCount = teamLeaders.length;

    const response: DashboardSummaryResponse = {
      scope: isOM ? "organization" : "team",
      campaigns: {
        total: campaignRows.length,
        active: statusCount("active"),
        paused: statusCount("paused"),
        draft: statusCount("draft"),
        completed: statusCount("completed"),
        ending_today: endingToday,
        ending_this_week: endingThisWeek,
      },
      leads: {
        total: totalLeads,
        today: todayLeads,
        qualified: qualifiedLeads,
        disqualified: disqualifiedLeads,
        qualification_rate_pct: qualificationRatePct,
        today_conversion_rate_pct: todayConversionRatePct,
      },
      people: {
        total_team_leaders: tlCount,
        total_agents: agents.length,
        active_agents: activeAgentCount,
        inactive_agents: inactiveAgents,
        avg_leads_per_agent:
          activeAgentCount > 0 ? Math.round(totalLeads / activeAgentCount) : 0,
        avg_leads_per_team: tlCount > 0 ? Math.round(totalLeads / tlCount) : 0,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("TL dashboard summary error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
