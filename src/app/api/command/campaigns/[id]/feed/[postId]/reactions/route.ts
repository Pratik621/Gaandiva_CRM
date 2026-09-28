import { NextResponse } from "next/server";
import { logFeedActivity } from "@/lib/command/campaign-feed";
import { authorizeCampaignFeed } from "@/lib/command/campaign-feed-auth";
import { canDeleteAnyFeedPost } from "@/lib/command/campaign-feed-access";
import { createNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

type DbAny = (s: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>) => ReturnType<
  Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>["from"]
>;
const db = ((s) => s) as DbAny;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id: campaignId, postId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const emoji = String(body?.emoji ?? "").trim();
    const replyId = body?.reply_id ? String(body.reply_id) : null;

    if (!emoji) {
      return NextResponse.json({ error: "Emoji required" }, { status: 400 });
    }

    const { data: post } = (await db(auth.supabase)
      .from("campaign_feed")
      .select("id, user_id, deleted_at")
      .eq("id", postId)
      .eq("campaign_id", campaignId)
      .single()) as {
      data: { id: string; user_id: string; deleted_at: string | null } | null;
    };

    if (!post || post.deleted_at) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (replyId) {
      const { data: reply } = (await db(auth.supabase)
        .from("campaign_feed_replies")
        .select("id, deleted_at")
        .eq("id", replyId)
        .eq("post_id", postId)
        .single()) as { data: { id: string; deleted_at: string | null } | null };
      if (!reply || reply.deleted_at) {
        return NextResponse.json({ error: "Reply not found" }, { status: 404 });
      }
    }

    const filter = replyId
      ? { reply_id: replyId, user_id: auth.userId, emoji }
      : { post_id: postId, user_id: auth.userId, emoji };

    const { data: existing } = (await db(auth.supabase)
      .from("campaign_feed_reactions")
      .select("id")
      .match(filter)
      .maybeSingle()) as { data: { id: string } | null };

    if (existing) {
      await db(auth.supabase)
        .from("campaign_feed_reactions")
        .delete()
        .eq("id", existing.id);
      return NextResponse.json({ toggled: "removed", emoji });
    }

    const { data: reaction, error } = (await db(auth.supabase)
      .from("campaign_feed_reactions")
      .insert({
        post_id: replyId ? null : postId,
        reply_id: replyId,
        organization_id: auth.orgId,
        user_id: auth.userId,
        emoji,
      } as never)
      .select("id")
      .single()) as { data: { id: string } | null; error: { message: string } | null };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logFeedActivity(auth.supabase, {
      organizationId: auth.orgId,
      campaignId,
      actorId: auth.userId,
      action: "reacted",
      feedPostId: postId,
      feedReplyId: replyId,
      metadata: { emoji },
    });

    if (post.user_id !== auth.userId) {
      const { data: campaign } = (await db(auth.supabase)
        .from("campaigns")
        .select("name")
        .eq("id", campaignId)
        .single()) as { data: { name: string } | null };

      void createNotifications([{
        title: "Reaction on your post",
        message: `${emoji} on your post in ${campaign?.name ?? "campaign"}`,
        type: "campaign",
        sender_id: auth.userId,
        receiver_id: post.user_id,
        reference_type: "campaign",
        reference_id: campaignId,
        organization_id: auth.orgId,
      }]);
    }

    return NextResponse.json({ toggled: "added", id: reaction?.id, emoji });
  } catch (err) {
    console.error("POST campaign feed reaction error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id: campaignId, postId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const pinned = Boolean(body?.pinned);

    const { data: post } = (await db(auth.supabase)
      .from("campaign_feed")
      .select("id, deleted_at")
      .eq("id", postId)
      .eq("campaign_id", campaignId)
      .single()) as { data: { id: string; deleted_at: string | null } | null };

    if (!post || post.deleted_at) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const { error } = await db(auth.supabase)
      .from("campaign_feed")
      .update({
        is_pinned: pinned,
        pinned_at: pinned ? new Date().toISOString() : null,
        pinned_by: pinned ? auth.userId : null,
      } as never)
      .eq("id", postId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logFeedActivity(auth.supabase, {
      organizationId: auth.orgId,
      campaignId,
      actorId: auth.userId,
      action: pinned ? "pinned" : "unpinned",
      feedPostId: postId,
    });

    return NextResponse.json({ success: true, pinned });
  } catch (err) {
    console.error("PATCH campaign feed pin error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id: campaignId, postId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const replyId = url.searchParams.get("reply_id");
    if (!replyId) {
      return NextResponse.json({ error: "reply_id required" }, { status: 400 });
    }

    const { data: reply } = (await db(auth.supabase)
      .from("campaign_feed_replies")
      .select("id, user_id, deleted_at")
      .eq("id", replyId)
      .eq("post_id", postId)
      .single()) as {
      data: { id: string; user_id: string; deleted_at: string | null } | null;
    };

    if (!reply || reply.deleted_at) {
      return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    }

    const canDelete =
      reply.user_id === auth.userId || canDeleteAnyFeedPost(auth.roleNames);
    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await db(auth.supabase)
      .from("campaign_feed_replies")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: auth.userId,
      } as never)
      .eq("id", replyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logFeedActivity(auth.supabase, {
      organizationId: auth.orgId,
      campaignId,
      actorId: auth.userId,
      action: "deleted",
      feedPostId: postId,
      feedReplyId: replyId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE campaign feed reply error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
