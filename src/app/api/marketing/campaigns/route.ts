import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdName, mostCommon } from "@/lib/marketing/lead-fields";
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

    const { data: campaigns, error: campaignsError } = await supabase
      .from("simplified_campaigns")
      .select("id, name, external_campaign_id, status, created_at")
      .order("created_at", { ascending: false });

    if (campaignsError) {
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    const campaignRows = (campaigns ?? []) as {
      id: string;
      name: string;
      external_campaign_id: string | null;
      status: string;
      created_at: string;
    }[];

    const dateRange = parseLeadDateRange(new URL(request.url).searchParams);
    const { data: leadRows, error: leadsError } = await fetchAllRows<Record<string, unknown>>((from, to) => {
      let query = supabase.from("simplified_leads").select("simplified_campaign_id, status, raw_data");
      if (dateRange.from) query = query.gte("created_at", dateRange.from);
      if (dateRange.to) query = query.lte("created_at", dateRange.to);
      return query.order("id", { ascending: true }).range(from, to);
    });

    if (leadsError) {
      return NextResponse.json({ error: leadsError }, { status: 500 });
    }

    const emptyCounts = { new: 0, follow_up: 0, in_progress: 0, closed: 0, total: 0 };
    const counts = new Map<string, typeof emptyCounts>();
    const adNamesByCampaign = new Map<string, string[]>();
    for (const row of leadRows as unknown as {
      simplified_campaign_id: string;
      status: string;
      raw_data: Record<string, string> | null;
    }[]) {
      const bucket = counts.get(row.simplified_campaign_id) ?? { ...emptyCounts };
      bucket.total += 1;
      if (row.status === "new") bucket.new += 1;
      else if (row.status === "follow_up") bucket.follow_up += 1;
      else if (row.status === "in_progress") bucket.in_progress += 1;
      else if (row.status === "closed") bucket.closed += 1;
      counts.set(row.simplified_campaign_id, bucket);

      const adNames = adNamesByCampaign.get(row.simplified_campaign_id) ?? [];
      const adName = getAdName(row.raw_data);
      if (adName) adNames.push(adName);
      adNamesByCampaign.set(row.simplified_campaign_id, adNames);
    }

    const result = campaignRows
      .map((c) => ({
        ...c,
        displayName: mostCommon(adNamesByCampaign.get(c.id) ?? []) || c.name,
        leadCounts: counts.get(c.id) ?? { ...emptyCounts },
      }))
      // With a date filter, only campaigns that received leads in that range.
      .filter((c) => !(dateRange.from || dateRange.to) || c.leadCounts.total > 0);

    return NextResponse.json({ campaigns: result });
  } catch (err) {
    console.error("List simplified campaigns error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const status = body.status === "draft" ? "draft" : "active";

    if (!name) {
      return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("simplified_campaigns")
      .insert({
        organization_id: orgId,
        name,
        status,
        created_by: user.id,
      } as never)
      .select("id, name, external_campaign_id, status, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaign: data });
  } catch (err) {
    console.error("Create simplified campaign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
