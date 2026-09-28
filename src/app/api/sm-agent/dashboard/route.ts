import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const todayStart = startOfTodayIso();
    const nowIso = new Date().toISOString();

    // Org-wide, matching Marketing's own numbers — sm_agent visibility isn't
    // assignment-gated. Every metric here comes directly off
    // simplified_leads.status/callback_at; there's no per-call activity
    // metric anymore since the outcome-history system was removed.
    const [
      { count: totalAssigned },
      { count: newCount },
      { count: followUpsDueToday },
      { count: overdueFollowUps },
      { count: closedCount },
    ] = await Promise.all([
      supabase.from("simplified_leads").select("id", { count: "exact", head: true }),
      supabase
        .from("simplified_leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "new"),
      supabase
        .from("simplified_leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "follow_up")
        .gte("callback_at", todayStart)
        .lt("callback_at", new Date(new Date(todayStart).getTime() + 86400000).toISOString()),
      supabase
        .from("simplified_leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "follow_up")
        .lt("callback_at", nowIso),
      supabase
        .from("simplified_leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "closed"),
    ]);

    return NextResponse.json({
      totalAssigned: totalAssigned ?? 0,
      newLeads: newCount ?? 0,
      followUpsDueToday: followUpsDueToday ?? 0,
      overdueFollowUps: overdueFollowUps ?? 0,
      closedLeads: closedCount ?? 0,
    });
  } catch (err) {
    console.error("sm-agent dashboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
