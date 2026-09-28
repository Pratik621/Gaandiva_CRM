import { NextResponse, type NextRequest } from "next/server";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/server";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getProfile, getRoleNames } from "@/lib/command/db";
import {
  buildClientViewerCampaignScope,
  guardClientViewerCampaign,
} from "@/lib/command/client-viewer-scope";
import {
  computeQaAnalytics,
  type QaHistoryRow,
  type QaLeadRow,
  type QaUserRef,
} from "@/lib/command/qa-analytics";

export const dynamic = "force-dynamic";

const LEAD_ID_BATCH = 120;
const HISTORY_PAGE = 1000;

async function fetchStatusChangeHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadIds: string[]
): Promise<QaHistoryRow[]> {
  const out: QaHistoryRow[] = [];
  for (let b = 0; b < leadIds.length; b += LEAD_ID_BATCH) {
    const slice = leadIds.slice(b, b + LEAD_ID_BATCH);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("lead_history")
        .select("lead_id, old_value, new_value, created_at, changed_by, reason")
        .eq("change_type", "status_change")
        .in("lead_id", slice)
        .order("created_at", { ascending: true })
        .range(from, from + HISTORY_PAGE - 1);
      if (error) throw new Error(error.message);
      const chunk = (data ?? []) as QaHistoryRow[];
      out.push(...chunk);
      if (chunk.length < HISTORY_PAGE) break;
      from += HISTORY_PAGE;
    }
  }
  out.sort((a, c) => a.created_at.localeCompare(c.created_at));
  return out;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  if (!hasCommandRole(userRoles) && !userRoles.includes("client_viewer")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profile = await getProfile(supabase, user.id);

  if (userRoles.includes("client_viewer")) {
    const scope = buildClientViewerCampaignScope(user.email, profile?.client_id ?? null);
    const allowed = await guardClientViewerCampaign(supabase, scope, campaignId);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const { data: campaignDates } = await supabase
      .from("campaigns")
      .select("start_date, end_date")
      .eq("id", campaignId)
      .single();

    const { data: leadRows, error: leadsErr } = await supabase
      .from("leads")
      .select("id, created_at")
      .eq("campaign_id", campaignId);

    if (leadsErr) throw new Error(leadsErr.message);

    const leads = (leadRows ?? []) as QaLeadRow[];
    const leadIds = leads.map((l) => l.id);

    const history = leadIds.length > 0 ? await fetchStatusChangeHistory(supabase, leadIds) : [];

    const { data: dqRows, error: dqErr } = await supabase
      .from("leads")
      .select("id, disqualification_reasons")
      .eq("campaign_id", campaignId)
      .eq("status", "disqualified");

    if (dqErr) throw new Error(dqErr.message);

    const disqualifiedReasonsCsv = ((dqRows ?? []) as {
      id: string;
      disqualification_reasons: string | null;
    }[]).map((r) => ({
      lead_id: r.id,
      disqualification_reasons: r.disqualification_reasons,
    }));

    const userIds = [
      ...new Set(history.map((h) => h.changed_by).filter((x): x is string => Boolean(x))),
    ];

    const users = new Map<string, QaUserRef>();
    if (userIds.length > 0) {
      const { data: userRows, error: usersErr } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);
      if (usersErr) throw new Error(usersErr.message);
      for (const u of (userRows ?? []) as QaUserRef[]) {
        users.set(u.id, u);
      }
    }

    const leadDays = leads.map((l) => l.created_at.slice(0, 10)).sort();
    const dataMin = leadDays[0] ?? dayjs().format("YYYY-MM-DD");
    const dataMax = leadDays[leadDays.length - 1] ?? dataMin;

    const sp = request.nextUrl.searchParams;
    let rangeStart =
      sp.get("date_from")?.trim() ||
      (campaignDates as { start_date?: string | null } | null)?.start_date ||
      dataMin;
    let rangeEnd =
      sp.get("date_to")?.trim() ||
      (campaignDates as { end_date?: string | null } | null)?.end_date ||
      dataMax;

    if (!rangeStart) rangeStart = dataMin;
    if (!rangeEnd) rangeEnd = dataMax;
    if (rangeStart > rangeEnd) {
      const t = rangeStart;
      rangeStart = rangeEnd;
      rangeEnd = t;
    }

    const payload = computeQaAnalytics({
      leads,
      history,
      disqualifiedReasonsCsv,
      rangeStart,
      rangeEnd,
      users,
    });

    return NextResponse.json({
      rangeStart,
      rangeEnd,
      ...payload,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
