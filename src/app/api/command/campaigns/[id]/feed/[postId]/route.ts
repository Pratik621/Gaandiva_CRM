import { NextResponse } from "next/server";
import {
  logFeedActivity,
  normalizePostType,
  parseMentionsFromContent,
} from "@/lib/command/campaign-feed";
import { authorizeCampaignFeed } from "@/lib/command/campaign-feed-auth";
import { canDeleteAnyFeedPost } from "@/lib/command/campaign-feed-access";
import { getAdminClientSafe } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbAny = (s: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>) => ReturnType<
  Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>["from"]
>;
const db = ((s) => s) as DbAny;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id: campaignId, postId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const { data: existing } = (await db(auth.supabase)
      .from("campaign_feed")
      .select("id, user_id, deleted_at")
      .eq("id", postId)
      .eq("campaign_id", campaignId)
      .single()) as {
      data: { id: string; user_id: string; deleted_at: string | null } | null;
    };

    if (!existing || existing.deleted_at) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (existing.user_id !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const content = String(body?.content ?? "").trim();
    const postType = body?.post_type != null ? normalizePostType(body.post_type) : undefined;
    const mentions = [...new Set(parseMentionsFromContent(content))];

    const { error } = await db(auth.supabase)
      .from("campaign_feed")
      .update({
        content,
        ...(postType ? { post_type: postType } : {}),
        mentions,
        edited_at: new Date().toISOString(),
        edited_by: auth.userId,
      } as never)
      .eq("id", postId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logFeedActivity(auth.supabase, {
      organizationId: auth.orgId,
      campaignId,
      actorId: auth.userId,
      action: "edited",
      feedPostId: postId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH campaign feed post error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id: campaignId, postId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const { data: existing } = (await db(auth.supabase)
      .from("campaign_feed")
      .select("id, user_id, deleted_at")
      .eq("id", postId)
      .eq("campaign_id", campaignId)
      .single()) as {
      data: { id: string; user_id: string; deleted_at: string | null } | null;
    };

    if (!existing || existing.deleted_at) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const canDelete =
      existing.user_id === auth.userId || canDeleteAnyFeedPost(auth.roleNames);
    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Use admin client to bypass RLS for the soft-delete UPDATE.
    // Authorization is already verified above (owner or moderator).
    // We scope the update to both id + organization_id so no org boundary is crossed.
    const admin = getAdminClientSafe();
    const writeClient = admin ?? auth.supabase;

    const { error } = await (writeClient as typeof auth.supabase)
      .from("campaign_feed")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: auth.userId,
      } as never)
      .eq("id", postId)
      .eq("organization_id", auth.orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logFeedActivity(auth.supabase, {
      organizationId: auth.orgId,
      campaignId,
      actorId: auth.userId,
      action: "deleted",
      feedPostId: postId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE campaign feed post error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
