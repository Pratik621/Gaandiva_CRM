import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCallLogsClientSafe, CALL_LOGS_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/call-logs";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import { postgrestOrIlikeFilters } from "@/lib/postgrest-filter";

export const dynamic = "force-dynamic";

type CallLogRow = {
  id: string;
  lead_id: string;
  campaign_id: string | null;
  call_started_at: string | null;
  call_date: string | null;
  call_sequence: number | null;
  duration_seconds: number | null;
  duration_text: string | null;
  status: string;
};

type LeadInfo = {
  id: string;
  lead_id: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
};

const LEAD_INFO_SELECT = "id, lead_id, name, first_name, last_name, company_name, email";
const LEAD_SEARCH_COLUMNS = ["name", "first_name", "last_name", "company_name", "email", "lead_id"];

async function loadCampaignNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (campaignIds.length === 0) return names;
  const { data } = await supabase.from("campaigns").select("id, name").in("id", campaignIds);
  for (const c of (data ?? []) as { id: string; name: string | null }[]) names.set(c.id, c.name ?? "—");
  return names;
}

/**
 * Agent-only: every call the logged-in agent has in the Call Logs DB,
 * optionally filtered by ?campaign_id=. Lead details come from the Call Logs DB
 * leads table; campaign names are read from the main DB (existing agent access).
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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    if (!roleNames.includes("agent")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const callLogs = getCallLogsClientSafe();
    if (!callLogs) {
      return NextResponse.json({ error: CALL_LOGS_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const params = request.nextUrl.searchParams;
    const { page, limit, offset } = parseListPagination(params);
    const campaignFilter = params.get("campaign_id")?.trim() || null;

    // Campaign dropdown: every campaign this agent has calls in.
    const { data: campaignRows, error: campaignRowsError } = await callLogs
      .from("call_logs")
      .select("campaign_id")
      .eq("agent_id", user.id);
    if (campaignRowsError) {
      console.error("Call logs campaigns error:", campaignRowsError);
      return NextResponse.json({ error: "Failed to load call logs" }, { status: 500 });
    }
    const campaignIds = [
      ...new Set(
        ((campaignRows ?? []) as { campaign_id: string | null }[])
          .map((r) => r.campaign_id)
          .filter((id): id is string => !!id)
      ),
    ];

    // Search: match the agent's leads by name / company / email / lead ID, then filter calls to them.
    let searchLeadIds: string[] | null = null;
    const searchFilter = postgrestOrIlikeFilters(LEAD_SEARCH_COLUMNS, params.get("q") ?? "");
    if (searchFilter) {
      const [callLogsLeads, mainLeads] = await Promise.all([
        callLogs.from("leads").select("id").eq("assigned_agent_id", user.id).or(searchFilter).limit(500),
        supabase.from("leads").select("id").eq("assigned_agent_id", user.id).or(searchFilter).limit(500),
      ]);
      searchLeadIds = [
        ...new Set(
          [...(callLogsLeads.data ?? []), ...(mainLeads.data ?? [])].map((l) => (l as { id: string }).id)
        ),
      ];
    }

    const campaignsOut = async () => {
      const campaignNames = await loadCampaignNames(supabase, campaignIds);
      return {
        campaignNames,
        campaigns: campaignIds
          .map((id) => ({ id, name: campaignNames.get(id) ?? id }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    };

    if (searchLeadIds && searchLeadIds.length === 0) {
      const { campaigns } = await campaignsOut();
      return NextResponse.json({ callLogs: [], campaigns, pagination: buildPaginationMeta(page, limit, 0) });
    }

    let query = callLogs
      .from("call_logs")
      .select(
        "id, lead_id, campaign_id, call_started_at, call_date, call_sequence, duration_seconds, duration_text, status",
        { count: "exact" }
      )
      .eq("agent_id", user.id);
    if (campaignFilter) query = query.eq("campaign_id", campaignFilter);
    if (searchLeadIds) query = query.in("lead_id", searchLeadIds);

    const { data, error, count } = await query
      .order("call_date", { ascending: false, nullsFirst: false })
      .order("call_started_at", { ascending: false, nullsFirst: false })
      .order("lead_id", { ascending: true })
      .order("call_sequence", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (error) {
      console.error("Call logs list error:", error);
      return NextResponse.json({ error: "Failed to load call logs" }, { status: 500 });
    }
    const rows = (data ?? []) as CallLogRow[];

    // Lead details for this page (Call Logs DB first, then main DB for older app-logged calls).
    const leadIds = [...new Set(rows.map((r) => r.lead_id))];
    const leadsById = new Map<string, LeadInfo>();
    if (leadIds.length > 0) {
      const { data: leads } = await callLogs.from("leads").select(LEAD_INFO_SELECT).in("id", leadIds);
      for (const lead of (leads ?? []) as LeadInfo[]) leadsById.set(lead.id, lead);

      const missing = leadIds.filter((id) => !leadsById.has(id));
      if (missing.length > 0) {
        const { data: mainLeads } = await supabase.from("leads").select(LEAD_INFO_SELECT).in("id", missing);
        for (const lead of (mainLeads ?? []) as unknown as LeadInfo[]) leadsById.set(lead.id, lead);
      }
    }

    const { campaignNames, campaigns } = await campaignsOut();

    const callLogsOut = rows.map((row) => {
      const lead = leadsById.get(row.lead_id);
      const leadName =
        [lead?.first_name, lead?.last_name].filter(Boolean).join(" ").trim() || lead?.name || null;
      return {
        ...row,
        lead_code: lead?.lead_id ?? null,
        lead_name: leadName,
        company_name: lead?.company_name ?? null,
        email: lead?.email ?? null,
        campaign_name: row.campaign_id ? campaignNames.get(row.campaign_id) ?? null : null,
      };
    });

    return NextResponse.json({
      callLogs: callLogsOut,
      campaigns,
      pagination: buildPaginationMeta(page, limit, count ?? 0),
    });
  } catch (err) {
    console.error("Agent call logs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
