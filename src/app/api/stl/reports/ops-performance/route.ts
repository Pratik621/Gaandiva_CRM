import { NextResponse, type NextRequest } from "next/server";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { isAgentRole } from "@/lib/tl/team-hierarchy";
import {
  buildOpsPerformanceReport,
  buildQaUserMaps,
} from "@/lib/qatl/ops-performance-report";
import {
  parseOpsReportFilterParams,
  resolveOpsReportAgentScope,
  resolveOpsReportCampaigns,
} from "@/lib/qatl/ops-performance-filters";
import { hasOperationsManagerAccess } from "@/lib/auth/tl-access";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";

export const dynamic = "force-dynamic";

dayjs.extend(utc);
dayjs.extend(timezone);

function isValidTimeZone(tz: string | null): tz is string {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function todayInTz(tz: string): string {
  return dayjs().tz(tz).format("YYYY-MM-DD");
}

function monthsAgoInTz(tz: string, n: number): string {
  return dayjs().tz(tz).subtract(n, "month").format("YYYY-MM-DD");
}

/**
 * Ops performance report for the STL area. OM/admin get the full org-wide
 * report (same engine as /api/qatl/reports/ops-performance). A plain STL is
 * hard-scoped server-side to their own team leaders' agents — the tl_ids
 * filter is always forced to (a subset of) the caller's own TLs, so a
 * client can never widen scope by omitting or spoofing the filter.
 */
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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const isOrgWide = hasOperationsManagerAccess(roleNames) || roleNames.includes("admin");
    const isStl = roleNames.some((n) => isSeniorTeamLeaderRole(n));
    if (!isOrgWide && !isStl) {
      return NextResponse.json({ error: "Forbidden: STL or Operations Manager role required" }, { status: 403 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const sp = request.nextUrl.searchParams;
    const tzParam = sp.get("tz");
    const appTz = isValidTimeZone(tzParam) ? tzParam : "UTC";
    const today = todayInTz(appTz);
    const filters = parseOpsReportFilterParams(sp, appTz, {
      startDate: monthsAgoInTz(appTz, 1),
      endDate: today,
    });

    if (!isOrgWide) {
      const { data: ownTlRows, error: ownTlErr } = await admin
        .from("users")
        .select("id")
        .eq("organization_id", orgId)
        .eq("stl_id", user.id);

      if (ownTlErr) {
        return NextResponse.json({ error: ownTlErr.message }, { status: 500 });
      }

      const ownTlIds = (ownTlRows ?? []).map((r) => (r as { id: string }).id);
      const requestedTlIds = new Set(filters.tlIds ?? []);
      const scopedTlIds = requestedTlIds.size
        ? ownTlIds.filter((id) => requestedTlIds.has(id))
        : ownTlIds;
      // Always force tlIds, even for "All" — otherwise resolveOpsReportAgentScope
      // would fall through to the org-wide agent set for an empty filter.
      filters.tlIds = scopedTlIds;
      filters.agentIds = null;
    }

    const { data: allUsers, error: usersErr } = await admin
      .from("users")
      .select("id, full_name, email, user_roles(roles(name))")
      .eq("organization_id", orgId)
      .eq("status", "active");

    if (usersErr) {
      return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    type OrgUser = {
      id: string;
      full_name: string | null;
      email: string | null;
      user_roles: { roles: { name: string } | null }[] | null;
    };

    const orgUsers = (allUsers ?? []) as OrgUser[];
    const userById = new Map(orgUsers.map((u) => [u.id, u]));
    const userLabel = (id: string, fallback?: string | null) => {
      const u = userById.get(id);
      if (u) return u.full_name?.trim() || u.email?.trim() || fallback?.trim() || "Unknown";
      return fallback?.trim() || "Unknown";
    };

    const allAgentIds = new Set(
      orgUsers
        .filter((u) => (u.user_roles ?? []).some((r) => isAgentRole(r.roles?.name)))
        .map((u) => u.id)
    );

    // An STL with zero team leaders must never fall through to
    // resolveOpsReportAgentScope's "no tl/agent filter => org-wide" default.
    const { agentIds, restrictLeadsToAgents } =
      !isOrgWide && filters.tlIds?.length === 0
        ? { agentIds: new Set<string>(), restrictLeadsToAgents: true }
        : await resolveOpsReportAgentScope(admin, orgId, filters, allAgentIds);

    const qaUsers = orgUsers.filter((u) =>
      (u.user_roles ?? []).some((r) => {
        const n = (r.roles?.name ?? "").trim().toLowerCase().replace(/\s+/g, "_");
        return n === "qa";
      })
    );

    const { qaIds, qaNameToId } = buildQaUserMaps(qaUsers, (u) => userLabel(u.id));

    const campaignRows = await resolveOpsReportCampaigns(admin, orgId, filters);
    const campaignIds = campaignRows.map((c) => c.id);
    const campaignNameById = new Map(campaignRows.map((c) => [c.id, c.name]));

    const report = await buildOpsPerformanceReport(admin, orgId, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      startUtc: filters.startUtc,
      endUtc: filters.endUtc,
      appTz,
      userLabel,
      agentIds,
      restrictLeadsToAgents,
      qaUsers,
      qaIds,
      qaNameToId,
      campaignIds,
      campaignNameById,
      leadFilters: {
        channels: filters.channels,
        qaStatuses: filters.qaStatuses,
      },
    });

    return NextResponse.json({
      ...report,
      date_range: {
        ...report.date_range,
        start_time: filters.startTime,
        end_time: filters.endTime,
      },
    });
  } catch (err) {
    console.error("STL ops performance report error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
