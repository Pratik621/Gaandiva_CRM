import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getRoleNames, getCampaignAnalytics, getProfile } from "@/lib/command/db";
import {
  buildClientViewerCampaignScope,
  guardClientViewerCampaign,
} from "@/lib/command/client-viewer-scope";
import dayjs from "dayjs";

export const dynamic = "force-dynamic";

interface LeadRow {
  id: string;
  status: string;
  consent_status: string | null;
  channel: string | null;
  delivery_status: string | null;
  created_at: string;
  delivered_at: string | null;
}

/** For client_viewer, use delivered_at when available; otherwise fall back to created_at. */
function dateFor(lead: LeadRow, isClientViewer: boolean): string {
  if (isClientViewer && lead.delivered_at) return lead.delivered_at.slice(0, 10);
  return lead.created_at.slice(0, 10);
}

const QUALIFIED_LIKE = new Set(["qualified", "registered", "attended", "no_show"]);
const QA_REVIEWED = new Set(["qualified", "disqualified", "registered", "attended", "no_show"]);
const REGISTERED_LIKE = new Set(["registered", "attended", "no_show"]);

function normStatus(s: string): string {
  return String(s ?? "").toLowerCase();
}

function eachDayInRange(start: string, end: string): string[] {
  const a = dayjs(start, "YYYY-MM-DD", true);
  const b = dayjs(end, "YYYY-MM-DD", true);
  if (!a.isValid() || !b.isValid() || a.isAfter(b, "day")) return [];
  const out: string[] = [];
  for (let d = a; !d.isAfter(b, "day"); d = d.add(1, "day")) {
    out.push(d.format("YYYY-MM-DD"));
  }
  return out;
}

function buildTrendSeries(
  typedLeads: LeadRow[],
  start: string,
  end: string,
  isClientViewer = false
) {
  const days = eachDayInRange(start, end);
  const daily = days.map((d) => {
    const ingested = typedLeads.filter((l) => dateFor(l, isClientViewer) === d).length;
    const cum = typedLeads.filter((l) => dateFor(l, isClientViewer) <= d);
    const n = cum.length;
    const q = cum.filter((l) => QUALIFIED_LIKE.has(normStatus(l.status))).length;
    const dq = cum.filter((l) => normStatus(l.status) === "disqualified").length;
    const reg = cum.filter((l) => REGISTERED_LIKE.has(normStatus(l.status))).length;
    const qualDen = Math.max(1, q);
    return {
      date: d,
      leadVolume: ingested,
      qualificationRate: n > 0 ? Math.round((q / n) * 1000) / 10 : null,
      dqRate: n > 0 ? Math.round((dq / n) * 1000) / 10 : null,
      registrationRate: Math.round((reg / qualDen) * 1000) / 10,
    };
  });

  const weekly: {
    period: string;
    leadVolume: number;
    qualificationRate: number | null;
    dqRate: number | null;
    registrationRate: number | null;
  }[] = [];

  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    if (chunk.length === 0) continue;
    const last = chunk[chunk.length - 1];
    weekly.push({
      period: `${chunk[0].date} → ${last.date}`,
      leadVolume: chunk.reduce((s, r) => s + r.leadVolume, 0),
      qualificationRate: last.qualificationRate,
      dqRate: last.dqRate,
      registrationRate: last.registrationRate,
    });
  }

  const monthSet = new Set<string>();
  for (const d of days) monthSet.add(d.slice(0, 7));
  for (const l of typedLeads) monthSet.add(dateFor(l, isClientViewer).slice(0, 7));

  const monthly = [...monthSet]
    .filter((mk) => mk >= start.slice(0, 7) && mk <= end.slice(0, 7))
    .sort()
    .map((monthKey) => {
      const ingested = typedLeads.filter(
        (l) => dateFor(l, isClientViewer).slice(0, 7) === monthKey
      ).length;
      const cum = typedLeads.filter(
        (l) => dateFor(l, isClientViewer).slice(0, 7) <= monthKey
      );
      const n = cum.length;
      const q = cum.filter((l) => QUALIFIED_LIKE.has(normStatus(l.status))).length;
      const dq = cum.filter((l) => normStatus(l.status) === "disqualified").length;
      const reg = cum.filter((l) => REGISTERED_LIKE.has(normStatus(l.status))).length;
      const qualDen = Math.max(1, q);
      const label = dayjs(`${monthKey}-01`).isValid()
        ? dayjs(`${monthKey}-01`).format("MMM YYYY")
        : monthKey;
      return {
        period: label,
        month: monthKey,
        leadVolume: ingested,
        qualificationRate: n > 0 ? Math.round((q / n) * 1000) / 10 : null,
        dqRate: n > 0 ? Math.round((dq / n) * 1000) / 10 : null,
        registrationRate: Math.round((reg / qualDen) * 1000) / 10,
      };
    });

  return { daily, weekly, monthly };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const allowed = await guardClientViewerCampaign(supabase, scope, id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const { data: campaignDates } = await supabase
      .from("campaigns")
      .select("start_date, end_date")
      .eq("id", id)
      .single();

    const { metrics, leads, history, alerts } = await getCampaignAnalytics(supabase, id);

    const isClientViewer = userRoles.includes("client_viewer");
    const typedLeadsAll = leads as LeadRow[];
    const typedLeads = isClientViewer
      ? typedLeadsAll.filter(
          (l) => String(l.delivery_status ?? "").toLowerCase() === "delivered"
        )
      : typedLeadsAll;

    const statusBreakdown = typedLeads.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    }, {});

    const consentBreakdown = typedLeads.reduce<Record<string, number>>((acc, l) => {
      const cs = l.consent_status ?? "pending";
      acc[cs] = (acc[cs] ?? 0) + 1;
      return acc;
    }, {});

    const channelBreakdown = typedLeads.reduce<Record<string, number>>((acc, l) => {
      const ch = l.channel ?? "email";
      acc[ch] = (acc[ch] ?? 0) + 1;
      return acc;
    }, {});

    const dailyLeads = typedLeads.reduce<Record<string, number>>((acc, l) => {
      const day = dateFor(l, isClientViewer);
      acc[day] = (acc[day] ?? 0) + 1;
      return acc;
    }, {});

    const leadDays = typedLeads.map((l) => dateFor(l, isClientViewer)).sort();
    const dataMin = leadDays[0] ?? dayjs().format("YYYY-MM-DD");
    const dataMax = leadDays[leadDays.length - 1] ?? dataMin;

    const sp = request.nextUrl.searchParams;
    let rangeStart =
      sp.get("date_from")?.trim() ||
      dataMin ||
      (campaignDates as { start_date?: string | null } | null)?.start_date;
    let rangeEnd =
      sp.get("date_to")?.trim() ||
      dataMax ||
      (campaignDates as { end_date?: string | null } | null)?.end_date;

    if (!rangeStart) rangeStart = dataMin;
    if (!rangeEnd) rangeEnd = dataMax;
    if (rangeStart > rangeEnd) {
      const t = rangeStart;
      rangeStart = rangeEnd;
      rangeEnd = t;
    }

    const trends = buildTrendSeries(typedLeads, rangeStart, rangeEnd, isClientViewer);

    return NextResponse.json({
      metrics,
      leads: {
        total: typedLeads.length,
        statusBreakdown,
        consentBreakdown,
        channelBreakdown,
        dailyLeads: Object.entries(dailyLeads)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count })),
      },
      trends: {
        rangeStart,
        rangeEnd,
        daily: trends.daily,
        weekly: trends.weekly,
        monthly: trends.monthly,
      },
      history,
      alerts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
