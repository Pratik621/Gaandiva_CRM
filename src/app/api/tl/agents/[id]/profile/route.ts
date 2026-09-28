import { NextResponse } from "next/server";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasTLAccess } from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { fetchAgentCampaignStats, type AgentCampaignStats } from "@/lib/tl/agent-profile";

export const dynamic = "force-dynamic";

dayjs.extend(utc);
dayjs.extend(timezone);

export type AgentProfileResponse = {
  agent: {
    id: string;
    full_name: string | null;
    email: string | null;
    agent_code: string | null;
    status: string;
    department: string | null;
    designation: string | null;
  };
  campaigns: AgentCampaignStats[];
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
    if (!hasTLAccess(roleNames) && !roleNames.includes("admin")) {
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

    const { id: agentId } = await params;
    if (!agentId) {
      return NextResponse.json({ error: "Agent ID required" }, { status: 400 });
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

    const { data: agent, error: agentError } = await admin
      .from("users")
      .select("id, full_name, email, agent_code, status, department, designation, organization_id")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const typedAgent = agent as {
      id: string;
      full_name: string | null;
      email: string | null;
      agent_code: string | null;
      status: string;
      department: string | null;
      designation: string | null;
      organization_id: string | null;
    };

    if (typedAgent.organization_id !== orgId) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    let campaigns: AgentCampaignStats[] = [];
    try {
      campaigns = await fetchAgentCampaignStats(admin, {
        orgId,
        agentId,
        startUtc,
        endUtc,
      });
    } catch (statsErr) {
      const msg =
        statsErr instanceof Error ? statsErr.message : "Failed to load agent campaign stats";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const response: AgentProfileResponse = {
      agent: {
        id: typedAgent.id,
        full_name: typedAgent.full_name,
        email: typedAgent.email,
        agent_code: typedAgent.agent_code,
        status: typedAgent.status,
        department: typedAgent.department,
        designation: typedAgent.designation,
      },
      campaigns,
      date_range: { start: startDate, end: endDate },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("TL agent profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
