import { NextResponse } from "next/server";
import { getCampaignFeedMembers } from "@/lib/command/campaign-feed";
import { authorizeCampaignFeed } from "@/lib/command/campaign-feed-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const { data: campaign } = (await auth.supabase
      .from("campaigns")
      .select("client_id")
      .eq("id", campaignId)
      .single()) as { data: { client_id: string | null } | null };

    const members = await getCampaignFeedMembers(
      auth.supabase,
      auth.orgId,
      campaign?.client_id ?? null
    );

    return NextResponse.json({ members });
  } catch (err) {
    console.error("GET campaign feed members error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
