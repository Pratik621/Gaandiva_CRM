import { NextResponse } from "next/server";
import {
  listCampaignFeedPosts,
  logFeedActivity,
  normalizePostType,
  notifyFeedMembers,
  parseMentionsFromContent,
} from "@/lib/command/campaign-feed";
import { authorizeCampaignFeed } from "@/lib/command/campaign-feed-auth";
import {
  buildFeedPostPreview,
  formatCampaignAlertTimestamp,
  sendClientViewerFeedPostAlertEmail,
} from "@/lib/email/client-viewer-campaign-alerts";

export const dynamic = "force-dynamic";

type DbAny = (s: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>) => ReturnType<
  Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>["from"]
>;
const db = ((s) => s) as DbAny;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
    const cursor = url.searchParams.get("cursor");
    const search = url.searchParams.get("search") ?? undefined;
    const userId = url.searchParams.get("user_id") ?? undefined;
    const dateFrom = url.searchParams.get("date_from") ?? undefined;
    const dateTo = url.searchParams.get("date_to") ?? undefined;
    const postType = url.searchParams.get("post_type") ?? "all";

    const result = await listCampaignFeedPosts(auth.supabase, {
      campaignId,
      orgId: auth.orgId,
      limit,
      cursor,
      search,
      userId,
      dateFrom,
      dateTo,
      postType,
    });

    return NextResponse.json({
      posts: result.posts,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (err) {
    console.error("GET campaign feed error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const content = String(body?.content ?? "").trim();
    const postType = normalizePostType(body?.post_type);
    const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
    const explicitMentions = Array.isArray(body?.mentions)
      ? body.mentions.map(String)
      : [];
    const parsedMentions = parseMentionsFromContent(content);
    const mentions = [...new Set([...explicitMentions, ...parsedMentions])];

    // Validate + deduplicate lead references
    const rawLeadRefs = Array.isArray(body?.lead_refs) ? body.lead_refs : [];
    const seenLeadIds = new Set<string>();
    const lead_refs = rawLeadRefs.filter((r: unknown) => {
      if (typeof r !== "object" || !r || typeof (r as Record<string, unknown>).id !== "string") return false;
      const id = (r as Record<string, unknown>).id as string;
      if (seenLeadIds.has(id)) return false;
      seenLeadIds.add(id);
      return true;
    });

    if (!content && attachments.length === 0 && lead_refs.length === 0) {
      return NextResponse.json({ error: "Post content, attachment, or lead reference required" }, { status: 400 });
    }

    const { data: post, error } = (await db(auth.supabase)
      .from("campaign_feed")
      .insert({
        campaign_id: campaignId,
        organization_id: auth.orgId,
        user_id: auth.userId,
        post_type: attachments.length > 0 && postType === "text" ? "file" : postType,
        content,
        attachments,
        mentions,
        lead_refs,
      } as never)
      .select("id, created_at")
      .single()) as {
      data: { id: string; created_at: string } | null;
      error: { message: string } | null;
    };

    if (error || !post) {
      return NextResponse.json({ error: error?.message ?? "Failed to create post" }, { status: 500 });
    }

    await logFeedActivity(auth.supabase, {
      organizationId: auth.orgId,
      campaignId,
      actorId: auth.userId,
      action: "created",
      feedPostId: post.id,
    });

    const { data: campaign } = (await db(auth.supabase)
      .from("campaigns")
      .select("name, campaign_id, client_name")
      .eq("id", campaignId)
      .single()) as {
      data: { name: string; campaign_id: string; client_name: string | null } | null;
    };

    const campaignName = campaign?.name ?? "Campaign";

    void notifyFeedMembers(auth.supabase, {
      orgId: auth.orgId,
      campaignId,
      campaignName,
      senderId: auth.userId,
      title: campaignName,
      message: "New feed post",
    });

    if (mentions.length) {
      void notifyFeedMembers(auth.supabase, {
        orgId: auth.orgId,
        campaignId,
        campaignName,
        senderId: auth.userId,
        title: campaignName,
        message: "You were mentioned in this feed",
        mentionUserIds: mentions,
      });
    }

    if (auth.roleNames.includes("client_viewer")) {
      const [{ data: poster }, { data: authUser }] = await Promise.all([
        db(auth.supabase)
          .from("users")
          .select("full_name, email")
          .eq("id", auth.userId)
          .single(),
        auth.supabase.auth.getUser(),
      ]);

      const user = authUser?.user;
      const posterName =
        (poster as { full_name?: string | null } | null)?.full_name?.trim() ||
        user?.user_metadata?.full_name?.toString()?.trim() ||
        user?.email ||
        "Unknown User";
      const posterEmail =
        (poster as { email?: string | null } | null)?.email?.trim() ||
        user?.email ||
        "unknown-email";

      void sendClientViewerFeedPostAlertEmail({
        campaignUuid: campaignId,
        campaignName,
        campaignCode: (campaign?.campaign_id ?? "").trim() || "N/A",
        clientName: (campaign?.client_name ?? "N/A").trim() || "N/A",
        postedAt: formatCampaignAlertTimestamp(post.created_at),
        posterName,
        posterEmail,
        postPreview: buildFeedPostPreview(content),
      });
    }

    return NextResponse.json({ id: post.id, created_at: post.created_at }, { status: 201 });
  } catch (err) {
    console.error("POST campaign feed error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
