import { NextResponse } from "next/server";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasTLAccess, hasOrgWideInsightsAccess } from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import {
  fetchTeamLeaderCampaignStats,
  type TeamLeaderCampaignStats,
} from "@/lib/tl/team-leader-profile";

export const dynamic = "force-dynamic";

dayjs.extend(utc);
dayjs.extend(timezone);

export type TeamLeaderProfileResponse = {
  team_leader: {
    id: string;
    full_name: string | null;
    email: string | null;
    status: string;
  };
  agent_count: number;
  campaigns: TeamLeaderCampaignStats[];
  date_range: { start: string; end: string };
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

function utcStartOfDayInTz(dateStr: string, tz: string): string {
  return dayjs.tz(`${dateStr} 00:00:00.000`, "YYYY-MM-DD HH:mm:ss.SSS", tz).utc().toISOString();
}

function utcEndOfDayInTz(dateStr: string, tz: string): string {
  return dayjs.tz(`${dateStr} 23:59:59.999`, "YYYY-MM-DD HH:mm:ss.SSS", tz).utc().toISOString();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { id: tlId } = await params;
    if (!tlId) {
      return NextResponse.json({ error: "Team leader ID required" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const url = new URL(request.url);
    const tzParam = url.searchParams.get("tz");
    const appTz = isValidTimeZone(tzParam) ? tzParam : "UTC";
    const today = dayjs().tz(appTz).format("YYYY-MM-DD");
    const defaultStart = dayjs().tz(appTz).subtract(30, "day").format("YYYY-MM-DD");
    const startDate = url.searchParams.get("start_date") || defaultStart;
    const endDate = url.searchParams.get("end_date") || today;
    const startUtc = utcStartOfDayInTz(startDate, appTz);
    const endUtc = utcEndOfDayInTz(endDate, appTz);

    const { data: tlUser, error: tlError } = await admin
      .from("users")
      .select("id, full_name, email, status, organization_id")
      .eq("id", tlId)
      .single();

    if (tlError || !tlUser) {
      return NextResponse.json({ error: "Team leader not found" }, { status: 404 });
    }

    const typedTl = tlUser as {
      id: string;
      full_name: string | null;
      email: string | null;
      status: string;
      organization_id: string | null;
    };

    if (typedTl.organization_id !== orgId) {
      return NextResponse.json({ error: "Team leader not found" }, { status: 404 });
    }

    let stats: Awaited<ReturnType<typeof fetchTeamLeaderCampaignStats>>;
    try {
      stats = await fetchTeamLeaderCampaignStats(admin, {
        orgId,
        tlId,
        startUtc,
        endUtc,
        supabase,
      });
    } catch (statsErr) {
      const msg =
        statsErr instanceof Error ? statsErr.message : "Failed to load team leader campaigns";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const response: TeamLeaderProfileResponse = {
      team_leader: {
        id: typedTl.id,
        full_name: typedTl.full_name,
        email: typedTl.email,
        status: typedTl.status,
      },
      agent_count: stats.agent_count,
      campaigns: stats.campaigns,
      date_range: { start: startDate, end: endDate },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("TL team leader profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
