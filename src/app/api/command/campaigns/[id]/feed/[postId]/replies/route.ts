import { NextResponse } from "next/server";
import { createNotifications } from "@/lib/notifications";
import {
  fetchPostReplies,
  logFeedActivity,
  notifyFeedMembers,
  parseMentionsFromContent,
} from "@/lib/command/campaign-feed";
import { authorizeCampaignFeed } from "@/lib/command/campaign-feed-auth";

export const dynamic = "force-dynamic";

type DbAny = (s: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>) => ReturnType<
  Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>["from"]
>;
const db = ((s) => s) as DbAny;

async function getPost(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  campaignId: string,
  postId: string
) {
  const { data } = (await db(supabase)
    .from("campaign_feed")
    .select("id, user_id, deleted_at")
    .eq("id", postId)
    .eq("campaign_id", campaignId)
    .single()) as {
    data: { id: string; user_id: string; deleted_at: string | null } | null;
  };
  return data;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id: campaignId, postId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const post = await getPost(auth.supabase, campaignId, postId);
    if (!post || post.deleted_at) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const replies = await fetchPostReplies(auth.supabase, postId);
    return NextResponse.json({ replies });
  } catch (err) {
    console.error("GET campaign feed replies error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id: campaignId, postId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const post = await getPost(auth.supabase, campaignId, postId);
    if (!post || post.deleted_at) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const body = await request.json();
    const content = String(body?.content ?? "").trim();
    const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
    if (!content && attachments.length === 0) {
      return NextResponse.json({ error: "Reply content required" }, { status: 400 });
    }

    const mentions = parseMentionsFromContent(content);

    const { data: reply, error } = (await db(auth.supabase)
      .from("campaign_feed_replies")
      .insert({
        post_id: postId,
        organization_id: auth.orgId,
        user_id: auth.userId,
        content,
        mentions,
        attachments,
      } as never)
      .select("id, created_at")
      .single()) as {
      data: { id: string; created_at: string } | null;
      error: { message: string } | null;
    };

    if (error || !reply) {
      return NextResponse.json({ error: error?.message ?? "Failed to reply" }, { status: 500 });
    }

    await logFeedActivity(auth.supabase, {
      organizationId: auth.orgId,
      campaignId,
      actorId: auth.userId,
      action: "replied",
      feedPostId: postId,
      feedReplyId: reply.id,
    });

    const { data: campaign } = (await db(auth.supabase)
      .from("campaigns")
      .select("name")
      .eq("id", campaignId)
      .single()) as { data: { name: string } | null };

    void notifyFeedMembers(auth.supabase, {
      orgId: auth.orgId,
      campaignId,
      campaignName: campaign?.name ?? "Campaign",
      senderId: auth.userId,
      title: "New reply on campaign feed",
      message: `New reply in ${campaign?.name ?? "campaign"} feed`,
      excludeUserIds: [auth.userId],
    });

    if (post.user_id !== auth.userId) {
      void createNotifications([{
        title: "Reply to your post",
        message: `Someone replied to your post in ${campaign?.name ?? "campaign"}`,
        type: "campaign",
        sender_id: auth.userId,
        receiver_id: post.user_id,
        reference_type: "campaign",
        reference_id: campaignId,
        organization_id: auth.orgId,
      }]);
    }

    if (mentions.length) {
      void notifyFeedMembers(auth.supabase, {
        orgId: auth.orgId,
        campaignId,
        campaignName: campaign?.name ?? "Campaign",
        senderId: auth.userId,
        title: "You were mentioned",
        message: `You were mentioned in a reply in ${campaign?.name ?? "campaign"}`,
        mentionUserIds: mentions,
      });
    }

    return NextResponse.json({ id: reply.id, created_at: reply.created_at }, { status: 201 });
  } catch (err) {
    console.error("POST campaign feed reply error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
