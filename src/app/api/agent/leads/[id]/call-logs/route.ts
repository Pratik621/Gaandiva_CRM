import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { getCallLogsClientSafe, CALL_LOGS_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/call-logs";
import { getLeadForLeadAssetApi } from "@/lib/lead-api-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { findCallLogsLeadForAgent } from "@/lib/call-logs-leads";

export const dynamic = "force-dynamic";

// "*" so optional columns (caller_name, did_number, disposition) are returned when present.
const CALL_LOG_COLUMNS = "*";

/**
 * Agent-only call logs for a lead. Auth + lead access use the main Gaandiva DB;
 * call log rows live in the separate Call Logs Supabase project.
 */
async function getContext(leadId: string) {
  const supabase = await createClient();
  const admin = getAdminClientSafe();
  if (!admin) {
    return { error: NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 }) };
  }
  const callLogs = getCallLogsClientSafe();
  if (!callLogs) {
    return { error: NextResponse.json({ error: CALL_LOGS_NOT_CONFIGURED_MESSAGE }, { status: 503 }) };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const roleNames = await fetchUserRoleNames(supabase, user.id);
  if (!roleNames.includes("agent")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  // Leads routed to the Call Logs DB (see call-logs-leads.ts) are not in the main DB.
  const callLogsLead = await findCallLogsLeadForAgent(callLogs, leadId, user.id);
  if (callLogsLead) {
    return { callLogs, userId: user.id, lead: callLogsLead };
  }

  const leadResult = await getLeadForLeadAssetApi({ supabase, admin, orgId, userId: user.id, leadId });
  if ("error" in leadResult) return { error: leadResult.error };

  return { callLogs, userId: user.id, lead: leadResult.lead };
}

async function listCallLogs(
  callLogs: NonNullable<ReturnType<typeof getCallLogsClientSafe>>,
  leadId: string,
  agentId: string
) {
  return callLogs
    .from("call_logs")
    .select(CALL_LOG_COLUMNS)
    .eq("lead_id", leadId)
    .eq("agent_id", agentId)
    .order("call_date", { ascending: false, nullsFirst: false })
    .order("call_sequence", { ascending: false, nullsFirst: false })
    .order("call_started_at", { ascending: false, nullsFirst: false });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;
    if (!leadId) return NextResponse.json({ error: "Lead ID required" }, { status: 400 });

    const ctx = await getContext(leadId);
    if ("error" in ctx) return ctx.error;

    const { data, error } = await listCallLogs(ctx.callLogs, ctx.lead.id, ctx.userId);
    if (error) {
      console.error("Call logs GET error:", error);
      return NextResponse.json({ error: "Failed to load call logs" }, { status: 500 });
    }
    return NextResponse.json({ callLogs: data ?? [] });
  } catch (err) {
    console.error("Call logs GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;
    if (!leadId) return NextResponse.json({ error: "Lead ID required" }, { status: 400 });

    const ctx = await getContext(leadId);
    if ("error" in ctx) return ctx.error;

    const { error: insertError } = await ctx.callLogs.from("call_logs").insert({
      lead_id: ctx.lead.id,
      agent_id: ctx.userId,
      campaign_id: ctx.lead.campaign_id,
      status: "completed",
      call_started_at: new Date().toISOString(),
      call_date: new Date().toISOString().slice(0, 10),
      source: "app",
    });
    if (insertError) {
      console.error("Call logs POST error:", insertError);
      return NextResponse.json({ error: "Failed to add call log" }, { status: 500 });
    }

    const { data, error } = await listCallLogs(ctx.callLogs, ctx.lead.id, ctx.userId);
    if (error) {
      return NextResponse.json({ error: "Failed to load call logs" }, { status: 500 });
    }
    return NextResponse.json({ callLogs: data ?? [] });
  } catch (err) {
    console.error("Call logs POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
