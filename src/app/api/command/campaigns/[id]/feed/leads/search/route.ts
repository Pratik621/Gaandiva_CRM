import { NextResponse } from "next/server";
import { authorizeCampaignFeed } from "@/lib/command/campaign-feed-auth";
import type { CampaignFeedLeadRef } from "@/lib/command/campaign-feed-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/command/campaigns/[id]/feed/leads/search
 * Search leads within this campaign for the Lead Picker.
 * Query params:
 *   q          – search term (name, company_name, email, or UUID prefix)
 *   limit      – max results (default 20, max 50)
 *   exclude_ids – comma-separated lead UUIDs to exclude (already selected)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "200", 10) || 200));
    const excludeParam = url.searchParams.get("exclude_ids") ?? "";
    const excludeIds = excludeParam
      ? excludeParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    let query = auth.supabase
      .from("leads")
      .select("id, name, company_name, email, phone, status")
      .eq("campaign_id", campaignId)
      .eq("organization_id", auth.orgId)
      // Only show leads that MIS has marked as delivered
      .eq("delivery_status" as never, "delivered")
      .limit(limit);

    if (q) {
      const safe = q.replace(/[%_]/g, "\\$&");
      query = query.or(
        `name.ilike.%${safe}%,company_name.ilike.%${safe}%,email.ilike.%${safe}%`
      );
    }

    if (excludeIds.length) {
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data, error } = (await query.order("name", { ascending: true })) as {
      data: CampaignFeedLeadRef[] | null;
      error: { message: string } | null;
    };

    if (error) {
      console.error("feed/leads/search error:", error);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    return NextResponse.json({ leads: data ?? [] });
  } catch (err) {
    console.error("feed/leads/search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
