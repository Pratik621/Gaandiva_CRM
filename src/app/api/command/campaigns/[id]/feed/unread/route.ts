import { NextResponse } from "next/server";
import {
  getCampaignFeedUnreadCount,
  markCampaignFeedRead,
} from "@/lib/command/campaign-feed";
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

    const count = await getCampaignFeedUnreadCount(
      auth.supabase,
      campaignId,
      auth.orgId,
      auth.userId
    );

    return NextResponse.json({ count });
  } catch (err) {
    console.error("GET campaign feed unread error:", err);
    return NextResponse.json({ count: 0 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    await markCampaignFeedRead(
      auth.supabase,
      campaignId,
      auth.orgId,
      auth.userId
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST campaign feed unread error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
