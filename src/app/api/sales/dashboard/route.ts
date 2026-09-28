import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { LEAD_STATUS_OPTIONS } from "@/constants/salesLeadForm";

export const dynamic = "force-dynamic";

type Trend = "up" | "down" | "neutral";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - t);

  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs || 1} sec ago`;

  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;

  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function toTimeLabel(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toCurrency(num: number | null | undefined) {
  if (num == null || !Number.isFinite(num)) return "—";
  return `$${Number(num).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function computePercentChange(current: number, previous: number) {
  if (previous <= 0) {
    if (current <= 0) return { changeText: "0%", trend: "neutral" as Trend };
    return { changeText: "+100%", trend: "up" as Trend };
  }
  const pct = ((current - previous) / previous) * 100;
  const trend: Trend = Math.abs(pct) < 0.01 ? "neutral" : pct >= 0 ? "up" : "down";
  const sign = pct >= 0 ? "+" : "";
  return { changeText: `${sign}${pct.toFixed(1)}%`, trend };
}

async function getUserAndOrg() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];

  const canAccessSales =
    roleNames.includes("sales") || roleNames.includes("sales_manager") || roleNames.includes("admin");

  if (!canAccessSales) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, orgId, roleNames };
}

export async function GET() {
  try {
    const ctx = await getUserAndOrg();
    if ("error" in ctx) return ctx.error;

    const { user, orgId, roleNames } = ctx;
    const userId = user.id;
    const isManagerOrAdmin = roleNames.includes("sales_manager") || roleNames.includes("admin");

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    // ── Date ranges ────────────────────────────────────────────────────────
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTomorrow = addDays(startToday, 1);

    const start30 = addDays(now, -30);
    const start60 = addDays(now, -60);

    const startPrev30 = start60;
    const endPrev30 = start30;

    const startNext7 = now;
    const endNext7 = addDays(now, 7);
    const startPrev7 = addDays(now, -14);
    const endPrev7 = addDays(now, -7);

    // ── Base lead scope ───────────────────────────────────────────────────
    // .select() MUST be called first on a PostgrestQueryBuilder before any filter methods.
    const makeLeadQuery = (columns = "id", opts?: { count?: "exact"; head?: boolean }) => {
      let q = (admin.from("sales_leads").select(columns, opts) as any).eq("organization_id", orgId);
      if (!isManagerOrAdmin) {
        q = q.or(`assigned_agent_id.eq.${userId},created_by.eq.${userId}`);
      }
      return q;
    };

    // Same pattern for tasks count queries — fresh builder each time to avoid filter accumulation.
    const makeTaskCountQ = () => {
      let q = (admin.from("tasks").select("id", { count: "exact", head: true }) as any)
        .eq("organization_id", orgId)
        .eq("status", "pending");
      if (!isManagerOrAdmin) q = q.eq("assigned_to", userId);
      return q;
    };

    const { count: totalLeadsCount } = await makeLeadQuery("id", { count: "exact", head: true });

    const { count: convertedLeadsCount } = await makeLeadQuery("id", { count: "exact", head: true })
      .eq("converted", true);

    const { count: leadsLast30 } = await makeLeadQuery("id", { count: "exact", head: true })
      .gte("created_at", start30.toISOString());

    const { count: leadsPrev30 } = await makeLeadQuery("id", { count: "exact", head: true })
      .gte("created_at", startPrev30.toISOString())
      .lt("created_at", endPrev30.toISOString());

    const { count: todaysLeadsCount } = await makeLeadQuery("id", { count: "exact", head: true })
      .gte("created_at", startToday.toISOString())
      .lt("created_at", startTomorrow.toISOString());

    // Conversion rate in % (all time, within current lead scope)
    const conversionRate = totalLeadsCount
      ? (convertedLeadsCount ? (convertedLeadsCount / totalLeadsCount) * 100 : 0)
      : 0;

    const leads30Trend = computePercentChange(leadsLast30 ?? 0, leadsPrev30 ?? 0);

    // ── Follow-ups (pending tasks due next 7 days) ───────────────────────
    const { count: next7Pending } = await makeTaskCountQ()
      .gte("due_date", startNext7.toISOString())
      .lt("due_date", endNext7.toISOString());

    const { count: prev7Pending } = await makeTaskCountQ()
      .gte("due_date", startPrev7.toISOString())
      .lt("due_date", endPrev7.toISOString());

    const followUpTrend = computePercentChange(next7Pending ?? 0, prev7Pending ?? 0);

    // ── Lead Trend (latest seven dates with lead activity) ──────────────
    const { data: trendLeads } = await makeLeadQuery("created_at, converted_at")
      .order("created_at", { ascending: true });

    const dayKey = (value: string) => value.slice(0, 10);
    const activityDays = new Set<string>();
    for (const lead of trendLeads ?? []) {
      const createdAt = (lead as any).created_at as string | null;
      const convertedAt = (lead as any).converted_at as string | null;
      if (createdAt) activityDays.add(dayKey(createdAt));
      if (convertedAt) activityDays.add(dayKey(convertedAt));
    }

    const trendDays = Array.from(activityDays).sort().slice(-7);
    const trendBuckets = new Map(
      trendDays.map((day) => [day, { leads: 0, conversions: 0 }])
    );
    for (const lead of trendLeads ?? []) {
      const createdAt = (lead as any).created_at as string | null;
      const convertedAt = (lead as any).converted_at as string | null;
      if (createdAt) trendBuckets.get(dayKey(createdAt))!.leads += 1;
      if (convertedAt) trendBuckets.get(dayKey(convertedAt))!.conversions += 1;
    }

    const leadTrendData = trendDays.map((day) => ({
      date: new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      leads: trendBuckets.get(day)?.leads ?? 0,
      conversions: trendBuckets.get(day)?.conversions ?? 0,
    }));

    // ── Lead Pipeline (bar chart) by lead status ────────────────────────
    const statusOrder = LEAD_STATUS_OPTIONS.map((s) => s.value);
    const statusCounts: Record<string, { count: number; value: number }> = {};
    for (const v of statusOrder) statusCounts[v] = { count: 0, value: 0 };

    const { data: pipelineLeads } = await makeLeadQuery("status, budget");

    for (const l of pipelineLeads ?? []) {
      const st = ((l as any).status as string | null) ?? "new";
      const budgetRaw = (l as any).budget as string | null;
      const budgetNum = budgetRaw ? Number(String(budgetRaw).replace(/[^0-9.]/g, "")) : NaN;
      const slot = statusCounts[st] ?? { count: 0, value: 0 };
      slot.count += 1;
      slot.value += Number.isFinite(budgetNum) ? budgetNum : 0;
      statusCounts[st] = slot;
    }

    const pipelineData = statusOrder.map((st) => {
      const label = LEAD_STATUS_OPTIONS.find((o) => o.value === st)?.label ?? st;
      return { stage: label, count: statusCounts[st]?.count ?? 0, value: statusCounts[st]?.value ?? 0 };
    });

    // ── Lead Source (pie chart) ─────────────────────────────────────────
    const { data: sourcesLeads } = await makeLeadQuery("lead_source");

    const sourceCounts = new Map<string, number>();
    for (const l of sourcesLeads ?? []) {
      const src = String((l as any).lead_source ?? "").trim();
      const key = src ? src : "—";
      sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
    }

    const sourcesSorted = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]);
    const palette = ["#4f46e5", "#52c41a", "#722ed1", "#f59e0b", "#eb2f96", "#13c2c2", "#4b5563", "#6b7280"];
    const top = sourcesSorted.slice(0, 5);
    const restCount = sourcesSorted.slice(5).reduce((s, [, c]) => s + c, 0);
    const leadSourceData: { name: string; value: number; color: string }[] = top.map(([name, value], i) => ({
      name,
      value,
      color: palette[i % palette.length],
    }));
    if (restCount > 0) {
      leadSourceData.push({
        name: "Others",
        value: restCount,
        color: "#d1d5db",
      });
    }

    // ── Recent Leads table (latest seven accessible leads) ──────────────
    const { data: recentLeadsRows } = await makeLeadQuery("id, lead_name, first_name, last_name, company_name, lead_source, status, budget, created_at")
      .order("created_at", { ascending: false })
      .limit(7);

    const recentLeadsData = (recentLeadsRows ?? []).map((l: any) => {
      const name =
        (l.lead_name as string | null) ||
        [l.first_name, l.last_name].filter((p: any) => p && String(p).trim()).join(" ").trim() ||
        "Unnamed lead";
      const company = (l.company_name as string | null) || "—";
      const source = (l.lead_source as string | null) || "—";
      const statusValue = (l.status as string | null) || "new";
      const statusLabel = LEAD_STATUS_OPTIONS.find((o) => o.value === statusValue)?.label ?? statusValue;
      const budgetRaw = l.budget as string | null;
      const budgetNum = budgetRaw ? Number(String(budgetRaw).replace(/[^0-9.]/g, "")) : NaN;
      return {
        id: String(l.id),
        name,
        company,
        source,
        status: statusLabel,
        value: toCurrency(Number.isFinite(budgetNum) ? budgetNum : null),
        time: l.created_at ? timeAgo(l.created_at) : "—",
      };
    });

    // ── Tasks card (next 7 pending + some completed) ──────────────────────
    let tasksCardQ = admin
      .from("tasks")
      .select("id, title, due_date, priority, status")
      .eq("organization_id", orgId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8);

    if (!isManagerOrAdmin) tasksCardQ = tasksCardQ.eq("assigned_to", userId);

    const { data: tasksRows } = await tasksCardQ;
    const tasksData = (tasksRows ?? []).map((t: any) => ({
      id: String(t.id),
      task: (t.title as string | null) || "Task",
      dueTime: toTimeLabel((t.due_date as string | null) ?? null),
      priority: (t.priority as "high" | "medium" | "low" | null) ?? "medium",
      completed: (t.status as string | null) === "completed",
    }));

    // ── Activity feed (last 5 activities) ────────────────────────────────
    let activitiesQ = admin
      .from("activities")
      .select("id, activity_type, related_to_type, related_to_id, notes, activity_date, owner_id, created_at")
      .order("activity_date", { ascending: false })
      .limit(7);
    if (!isManagerOrAdmin) activitiesQ = activitiesQ.eq("owner_id", userId);

    const { data: activityRows } = await activitiesQ;

    const activityList = (activityRows ?? []) as any[];
    const ownerIds = [...new Set(activityList.map((a) => a.owner_id).filter(Boolean))] as string[];

    let ownerNames: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: ownerUserRows } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", ownerIds);
      ownerNames = {};
      (ownerUserRows ?? []).forEach((u: any) => {
        ownerNames[u.id] = u.full_name || u.email || "Unknown";
      });
    }

    const leadsIds = [...new Set(activityList.filter((a) => a.related_to_type === "lead").map((a) => a.related_to_id).filter(Boolean))] as string[];
    const contactIds = [...new Set(activityList.filter((a) => a.related_to_type === "contact").map((a) => a.related_to_id).filter(Boolean))] as string[];
    const dealIds = [...new Set(activityList.filter((a) => a.related_to_type === "deal").map((a) => a.related_to_id).filter(Boolean))] as string[];

    let leadNames: Record<string, string> = {};
    if (leadsIds.length > 0) {
      const { data: leadRows } = await admin
        .from("sales_leads")
        .select("id, lead_name, first_name, last_name")
        .in("id", leadsIds);
      (leadRows ?? []).forEach((r: any) => {
        leadNames[r.id] =
          r.lead_name ||
          [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
          "Lead";
      });
    }

    let contactNames: Record<string, string> = {};
    if (contactIds.length > 0) {
      const { data: contactRows } = await admin
        .from("contacts")
        .select("id, contact_name")
        .in("id", contactIds);
      (contactRows ?? []).forEach((r: any) => {
        contactNames[r.id] = r.contact_name || "Contact";
      });
    }

    let dealNames: Record<string, string> = {};
    if (dealIds.length > 0) {
      const { data: dealRows } = await admin
        .from("deals")
        .select("id, deal_name")
        .in("id", dealIds);
      (dealRows ?? []).forEach((r: any) => {
        dealNames[r.id] = r.deal_name || "Deal";
      });
    }

    const actionForType = (activityType: string) => {
      const t = activityType.toLowerCase();
      if (t === "note") return "added a note for";
      if (t === "call") return "logged a call with";
      if (t === "email") return "sent an email to";
      if (t === "meeting") return "scheduled a meeting with";
      if (t === "task") return "created a task for";
      if (t === "lifecycle_change") return "updated status for";
      return "updated record";
    };

    const activityFeedData = activityList.map((a: any) => {
      const user = a.owner_id ? ownerNames[a.owner_id] ?? "Unknown" : "Unknown";
      const relType = a.related_to_type as string | null;
      const relId = a.related_to_id as string | null;
      const target =
        relType === "lead"
          ? (relId ? leadNames[relId] : null)
          : relType === "contact"
            ? (relId ? contactNames[relId] : null)
            : relType === "deal"
              ? (relId ? dealNames[relId] : null)
              : null;

      const notes = (a.notes as string | null) ?? null;
      const value = notes ? (notes.length > 24 ? notes.slice(0, 24) + "…" : notes) : "—";
      const iso = (a.activity_date as string | null) ?? (a.created_at as string | null) ?? new Date().toISOString();
      return {
        id: String(a.id),
        user,
        action: actionForType(a.activity_type ?? ""),
        target: target ?? "—",
        value,
        time: timeAgo(iso),
        type: a.activity_type === "lifecycle_change" ? "success" : "default",
      };
    });

    // ── Compose stat cards ───────────────────────────────────────────────
    const conversionChange = computePercentChange(
      (() => {
        // conversion rate in last 30 days based on leads created in that window
        // We'll reuse conversionRate for overall; card expects some delta.
        // Use converted leads in last30 / leads created in last30 as a best-effort.
        return 0;
      })(),
      0
    );

    // For the conversion card delta: approximate with changes in conversion counts in last30 vs prev30
    const { count: convertedLast30 } = await makeLeadQuery("id", { count: "exact", head: true })
      .eq("converted", true)
      .gte("created_at", start30.toISOString());
    const { count: convertedPrev30 } = await makeLeadQuery("id", { count: "exact", head: true })
      .eq("converted", true)
      .gte("created_at", startPrev30.toISOString())
      .lt("created_at", endPrev30.toISOString());

    const conversionTrend = computePercentChange(convertedLast30 ?? 0, convertedPrev30 ?? 0);

    const stats = {
      totalLeads: {
        value: (totalLeadsCount ?? 0).toLocaleString(),
        change: leads30Trend.changeText,
        trend: leads30Trend.trend,
      },
      todaysLeads: {
        value: (todaysLeadsCount ?? 0).toString(),
        change: "+0",
        trend: "neutral" as Trend,
      },
      followUps: {
        value: (next7Pending ?? 0).toString(),
        change: followUpTrend.changeText,
        trend: followUpTrend.trend,
      },
      conversion: {
        value: `${conversionRate.toFixed(1)}%`,
        change: conversionTrend.changeText,
        trend: conversionTrend.trend,
      },
    };

    // Today's leads delta vs yesterday for nicer UI
    const { count: ydayLeads } = await makeLeadQuery("id", { count: "exact", head: true })
      .gte("created_at", addDays(startToday, -1).toISOString())
      .lt("created_at", startToday.toISOString());

    const todayTrend = computePercentChange(todaysLeadsCount ?? 0, ydayLeads ?? 0);
    stats.todaysLeads.change = todayTrend.changeText;
    stats.todaysLeads.trend = todayTrend.trend;

    return NextResponse.json({
      stats,
      pipelineData,
      leadTrendData,
      leadSourceData,
      tasksData,
      activityFeedData,
      recentLeadsData,
    });
  } catch (err) {
    console.error("Sales dashboard GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

