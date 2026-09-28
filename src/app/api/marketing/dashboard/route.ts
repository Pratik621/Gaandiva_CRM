import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

    // Exact counts (not fetched rows) - a row fetch is capped at 1000.
    const countByStatus = (status?: string) => {
      const query = supabase.from("simplified_leads").select("id", { count: "exact", head: true });
      return status ? query.eq("status", status) : query;
    };

    const [
      { count: campaignCount },
      { count: sourceCount },
      { count: leadCount, error: leadsError },
      { count: newCount },
      { count: followUpCount },
      { count: inProgressCount },
      { count: closedCount },
    ] = await Promise.all([
      supabase.from("simplified_campaigns").select("id", { count: "exact", head: true }),
      supabase.from("simplified_ad_sources").select("id", { count: "exact", head: true }),
      countByStatus(),
      countByStatus("new"),
      countByStatus("follow_up"),
      countByStatus("in_progress"),
      countByStatus("closed"),
    ]);

    if (leadsError) {
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    return NextResponse.json({
      campaignCount: campaignCount ?? 0,
      adSourceCount: sourceCount ?? 0,
      leadCount: leadCount ?? 0,
      statusCounts: {
        new: newCount ?? 0,
        follow_up: followUpCount ?? 0,
        in_progress: inProgressCount ?? 0,
        closed: closedCount ?? 0,
      },
    });
  } catch (err) {
    console.error("Marketing dashboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
