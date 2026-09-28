import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/marketing/fetch-all";
import { parseLeadDateRange } from "@/lib/marketing/date-range";

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
    const dateRange = parseLeadDateRange(searchParams);

    const { data, error } = await fetchAllRows<Record<string, unknown>>((from, to) => {
      let query = supabase
        .from("simplified_leads")
        .select("*, simplified_campaigns(name, external_campaign_id)");
      if (status) query = query.eq("status", status);
      if (dateRange.from) query = query.gte("created_at", dateRange.from);
      if (dateRange.to) query = query.lte("created_at", dateRange.to);
      return query
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
    });

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ leads: data });
  } catch (err) {
    console.error("List marketing leads error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
