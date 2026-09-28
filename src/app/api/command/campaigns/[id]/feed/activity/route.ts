import { NextResponse } from "next/server";
import { authorizeCampaignFeed } from "@/lib/command/campaign-feed-auth";
import { getAdminClientSafe } from "@/lib/supabase/admin";

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
    const postId = url.searchParams.get("post_id");
    const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50);

    let query = db(auth.supabase)
      .from("campaign_feed_activity_log")
      .select("id, action, actor_id, feed_post_id, feed_reply_id, metadata, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (postId) query = query.eq("feed_post_id", postId);

    const { data: rows, error } = (await query) as {
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
    };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const actorIds = [...new Set((rows ?? []).map((r) => String(r.actor_id)))];

    // Use admin client to bypass RLS so client_viewer can see names of OM/other roles.
    const admin = getAdminClientSafe();
    const userClient = admin ?? auth.supabase;

    const { data: users } = (await db(userClient as typeof auth.supabase)
      .from("users")
      .select("id, full_name, avatar_url")
      .in("id", actorIds)) as {
      data: Array<{ id: string; full_name: string | null; avatar_url: string | null }> | null;
    };

    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    const activity = (rows ?? []).map((r) => ({
      id: String(r.id),
      action: String(r.action),
      actor_id: String(r.actor_id),
      actor: userMap.get(String(r.actor_id)) ?? null,
      feed_post_id: r.feed_post_id ? String(r.feed_post_id) : null,
      feed_reply_id: r.feed_reply_id ? String(r.feed_reply_id) : null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      created_at: String(r.created_at),
    }));

    return NextResponse.json({ activity });
  } catch (err) {
    console.error("GET campaign feed activity error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
