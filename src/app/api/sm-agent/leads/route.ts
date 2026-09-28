import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/marketing/fetch-all";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const campaignId = searchParams.get("campaign_id");

    // TEMPORARY SCOPE: org-wide (same leads Marketing sees), not filtered to
    // this agent's own assigned_agent_id — matches the relaxed RLS while the
    // per-agent assignment chain is worked out.
    const { data, error } = await fetchAllRows<Record<string, unknown>>((from, to) => {
      let query = supabase
        .from("simplified_leads")
        .select("*, simplified_campaigns(name, external_campaign_id)");
      if (status) query = query.eq("status", status);
      if (campaignId) query = query.eq("simplified_campaign_id", campaignId);
      // Callbacks due soonest first, then newest leads (e.g. fresh Meta imports).
      return query
        .order("callback_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
    });

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ leads: data });
  } catch (err) {
    console.error("List sm-agent leads error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
