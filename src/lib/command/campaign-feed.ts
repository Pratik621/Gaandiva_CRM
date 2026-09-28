/**
 * Server-side helpers for campaign collaboration feed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { createNotifications } from "@/lib/notifications";
import { getRoleDisplayLabel } from "@/lib/command/campaign-feed-access";
import {
  buildClientViewerCampaignScope,
  clientViewerCanAccessCampaign,
} from "@/lib/command/client-viewer-scope";
import type {
  CampaignFeedAttachment,
  CampaignFeedLeadRef,
  CampaignFeedMember,
  CampaignFeedPost,
  CampaignFeedPostType,
  CampaignFeedReaction,
  CampaignFeedReply,
  CampaignFeedUser,
} from "@/lib/command/campaign-feed-types";

type Client = SupabaseClient<Database>;
type DbAny = (supabase: Client) => ReturnType<Client["from"]>;
const db = ((supabase: Client) => supabase) as DbAny;

const FEED_BUCKET = "campaign-feed-attachments";

type RawUserRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email?: string | null;
};

type RawRoleRow = {
  user_id: string;
  roles: { name: string } | null;
};

export function parseMentionsFromContent(content: string): string[] {
  const matches = content.match(/@\[([0-9a-f-]{36})\]/gi) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -1).toLowerCase()))];
}

export function normalizePostType(raw: unknown): CampaignFeedPostType {
  const v = String(raw ?? "text").toLowerCase();
  if (v === "announcement" || v === "question" || v === "update" || v === "file") {
    return v;
  }
  return "text";
}

export async function assertCampaignFeedAccess(
  supabase: Client,
  campaignId: string,
  orgId: string,
  roleNames: string[],
  clientId: string | null,
  userEmail?: string | null
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  let query = db(supabase)
    .from("campaigns")
    .select("id, client_id")
    .eq("id", campaignId)
    .eq("organization_id", orgId);

  const { data: campaign, error } = (await query.single()) as {
    data: { id: string; client_id: string | null } | null;
    error: { message: string } | null;
  };

  if (error || !campaign) {
    return { ok: false, status: 404, error: "Campaign not found" };
  }

  const isClientViewer = roleNames.includes("client_viewer");
  if (isClientViewer) {
    const scope = buildClientViewerCampaignScope(userEmail, clientId);
    if (!clientViewerCanAccessCampaign(scope, campaignId, campaign.client_id)) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
  }

  return { ok: true };
}

async function fetchUserMap(
  supabase: Client,
  userIds: string[]
): Promise<Map<string, CampaignFeedUser>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, CampaignFeedUser>();
  if (!unique.length) return map;

  // Use admin client so RLS on `users` doesn't hide cross-role profiles
  // (e.g. client_viewer can't read OM's row under RLS). We scope manually to
  // the exact userIds we already know, so no org boundary is crossed.
  const admin = getAdminClientSafe();
  const client = admin ?? supabase;

  const { data: users } = (await (client as Client)
    .from("users")
    .select("id, full_name, avatar_url")
    .in("id", unique)) as { data: RawUserRow[] | null };

  const { data: roleRows } = (await (client as Client)
    .from("user_roles")
    .select("user_id, roles(name)")
    .in("user_id", unique)) as { data: RawRoleRow[] | null };

  const rolesByUser = new Map<string, string[]>();
  for (const row of roleRows ?? []) {
    const name = row.roles?.name;
    if (!name) continue;
    const list = rolesByUser.get(row.user_id) ?? [];
    list.push(name);
    rolesByUser.set(row.user_id, list);
  }

  for (const u of users ?? []) {
    const roles = rolesByUser.get(u.id) ?? [];
    map.set(u.id, {
      id: u.id,
      full_name: u.full_name,
      avatar_url: u.avatar_url,
      role_label: getRoleDisplayLabel(roles),
    });
  }

  return map;
}

async function signAttachments(
  supabase: Client,
  attachments: CampaignFeedAttachment[]
): Promise<CampaignFeedAttachment[]> {
  if (!attachments.length) return [];
  return Promise.all(
    attachments.map(async (a) => {
      if (!a.path) return { ...a, downloadUrl: null };
      const { data } = await supabase.storage
        .from(FEED_BUCKET)
        .createSignedUrl(a.path, 3600);
      return { ...a, downloadUrl: data?.signedUrl ?? null };
    })
  );
}

export async function getCampaignFeedMembers(
  supabase: Client,
  orgId: string,
  campaignClientId: string | null
): Promise<CampaignFeedMember[]> {
  const admin = getAdminClientSafe();
  const client = admin ?? supabase;

  const { data: roleRows } = (await client
    .from("user_roles")
    .select("user_id, roles(name)")) as { data: RawRoleRow[] | null };

  const { data: orgUsers } = (await client
    .from("users")
    .select("id")
    .eq("organization_id", orgId)) as { data: { id: string }[] | null };

  const orgUserIds = new Set((orgUsers ?? []).map((u) => u.id));

  const feedUserIds = new Set<string>();
  const roleMap = new Map<string, string[]>();

  for (const row of roleRows ?? []) {
    if (!orgUserIds.has(row.user_id)) continue;
    const roleName = row.roles?.name?.toLowerCase().replace(/\s+/g, "_") ?? "";
    const isFeedRole =
      roleName === "operations_manager" ||
      roleName === "sales_manager" ||
      roleName === "client_viewer" ||
      roleName === "internal_operator" ||
      roleName === "internal_admin" ||
      roleName === "admin";
    if (!isFeedRole) continue;
    feedUserIds.add(row.user_id);
    const list = roleMap.get(row.user_id) ?? [];
    if (row.roles?.name) list.push(row.roles.name);
    roleMap.set(row.user_id, list);
  }

  if (!feedUserIds.size) return [];

  let userQuery = client
    .from("users")
    .select("id, full_name, email, avatar_url, client_id")
    .eq("organization_id", orgId)
    .in("id", [...feedUserIds]);

  const { data: users } = (await userQuery) as {
    data: (RawUserRow & { client_id: string | null })[] | null;
  };

  const members: CampaignFeedMember[] = [];
  for (const u of users ?? []) {
    const roles = roleMap.get(u.id) ?? [];
    const normalized = roles.map((r) => r.toLowerCase().replace(/\s+/g, "_"));
    const isClientViewer = normalized.includes("client_viewer");
    if (isClientViewer) {
      if (!campaignClientId || u.client_id !== campaignClientId) continue;
    }
    members.push({
      id: u.id,
      full_name: u.full_name,
      email: u.email ?? null,
      avatar_url: u.avatar_url,
      role_label: getRoleDisplayLabel(roles),
    });
  }

  return members.sort((a, b) =>
    (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "")
  );
}

export async function logFeedActivity(
  supabase: Client,
  input: {
    organizationId: string;
    campaignId: string;
    actorId: string;
    action: string;
    feedPostId?: string | null;
    feedReplyId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await db(supabase).from("campaign_feed_activity_log").insert({
    organization_id: input.organizationId,
    campaign_id: input.campaignId,
    actor_id: input.actorId,
    action: input.action,
    feed_post_id: input.feedPostId ?? null,
    feed_reply_id: input.feedReplyId ?? null,
    metadata: input.metadata ?? {},
  } as never);
}

export async function notifyFeedMembers(
  supabase: Client,
  opts: {
    orgId: string;
    campaignId: string;
    campaignName: string;
    senderId: string;
    excludeUserIds?: string[];
    title: string;
    message: string;
    mentionUserIds?: string[];
  }
): Promise<void> {
  const { data: campaign } = (await db(supabase)
    .from("campaigns")
    .select("client_id, name")
    .eq("id", opts.campaignId)
    .single()) as { data: { client_id: string | null; name: string } | null };

  const members = await getCampaignFeedMembers(
    supabase,
    opts.orgId,
    campaign?.client_id ?? null
  );

  const exclude = new Set([opts.senderId, ...(opts.excludeUserIds ?? [])]);
  let receivers = members.filter((m) => !exclude.has(m.id));

  if (opts.mentionUserIds?.length) {
    const mentionSet = new Set(opts.mentionUserIds);
    receivers = receivers.filter((r) => mentionSet.has(r.id));
  }

  if (!receivers.length) return;

  void createNotifications(
    receivers.map((r) => ({
      title: opts.title,
      message: opts.message,
      type: "campaign" as const,
      sender_id: opts.senderId,
      receiver_id: r.id,
      reference_type: "campaign" as const,
      reference_id: opts.campaignId,
      organization_id: opts.orgId,
    }))
  );
}

export async function getCampaignFeedUnreadCount(
  supabase: Client,
  campaignId: string,
  orgId: string,
  userId: string
): Promise<number> {
  const { data: state } = (await db(supabase)
    .from("campaign_feed_read_state")
    .select("last_read_at")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .maybeSingle()) as {
    data: { last_read_at: string } | null;
    error: { message: string } | null;
  };

  const since = state?.last_read_at ?? "1970-01-01T00:00:00.000Z";

  const { count, error } = (await db(supabase)
    .from("campaign_feed_activity_log")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("organization_id", orgId)
    .gt("created_at", since)
    .neq("actor_id", userId)
    .in("action", ["created", "replied", "reacted"])) as {
    count: number | null;
    error: { message: string } | null;
  };

  if (error) return 0;
  return count ?? 0;
}

export async function markCampaignFeedRead(
  supabase: Client,
  campaignId: string,
  orgId: string,
  userId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing } = (await db(supabase)
    .from("campaign_feed_read_state")
    .select("user_id")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .maybeSingle()) as { data: { user_id: string } | null };

  if (existing) {
    await db(supabase)
      .from("campaign_feed_read_state")
      .update({ last_read_at: now } as never)
      .eq("user_id", userId)
      .eq("campaign_id", campaignId);
    return;
  }

  await db(supabase).from("campaign_feed_read_state").insert({
    user_id: userId,
    campaign_id: campaignId,
    organization_id: orgId,
    last_read_at: now,
  } as never);
}

type ListFeedOptions = {
  campaignId: string;
  orgId: string;
  limit: number;
  cursor?: string | null;
  search?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  postType?: string;
};

export async function listCampaignFeedPosts(
  supabase: Client,
  opts: ListFeedOptions
): Promise<{ posts: CampaignFeedPost[]; nextCursor: string | null; hasMore: boolean }> {
  let query = db(supabase)
    .from("campaign_feed")
    .select("*")
    .eq("campaign_id", opts.campaignId)
    .eq("organization_id", opts.orgId)
    // Include soft-deleted posts so they render as "This message has been deleted"
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit + 1);

  if (opts.postType && opts.postType !== "all") {
    if (opts.postType === "file") {
      query = query.or("post_type.eq.file,attachments.neq.[]");
    } else {
      query = query.eq("post_type", opts.postType);
    }
  }

  if (opts.userId) query = query.eq("user_id", opts.userId);
  if (opts.dateFrom) query = query.gte("created_at", opts.dateFrom);
  if (opts.dateTo) query = query.lte("created_at", `${opts.dateTo}T23:59:59.999Z`);
  if (opts.search?.trim()) {
    query = query.ilike("content", `%${opts.search.trim().replace(/[%_]/g, "\\$&")}%`);
  }

  if (opts.cursor) {
    try {
      const decoded = JSON.parse(
        Buffer.from(opts.cursor, "base64url").toString("utf8")
      ) as { created_at: string; id: string };
      query = query.or(
        `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`
      );
    } catch {
      /* ignore bad cursor */
    }
  }

  const { data: rows, error } = (await query) as {
    data: Array<Record<string, unknown>> | null;
    error: { message: string } | null;
  };

  if (error) throw new Error(error.message);

  const rawRows = rows ?? [];
  const hasMore = rawRows.length > opts.limit;
  const pageRows = hasMore ? rawRows.slice(0, opts.limit) : rawRows;
  const postIds = pageRows.map((r) => String(r.id));

  const userIds = pageRows.map((r) => String(r.user_id));
  const [userMap, reactionsByPost, repliesByPost] = await Promise.all([
    fetchUserMap(supabase, userIds),
    fetchReactionsForPosts(supabase, postIds),
    fetchRepliesForPosts(supabase, postIds, 3),
  ]);

  const posts: CampaignFeedPost[] = await Promise.all(
    pageRows.map(async (row) => {
      const id = String(row.id);
      const attachments = (row.attachments as CampaignFeedAttachment[]) ?? [];
      return {
        id,
        campaign_id: String(row.campaign_id),
        user_id: String(row.user_id),
        post_type: normalizePostType(row.post_type),
        content: String(row.content ?? ""),
        attachments: await signAttachments(supabase, attachments),
        mentions: (row.mentions as string[]) ?? [],
        is_pinned: Boolean(row.is_pinned),
        pinned_at: (row.pinned_at as string | null) ?? null,
        edited_at: (row.edited_at as string | null) ?? null,
        deleted_at: (row.deleted_at as string | null) ?? null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        user: userMap.get(String(row.user_id)) ?? null,
        reactions: reactionsByPost.get(id) ?? [],
        replies: repliesByPost.get(id)?.replies ?? [],
        reply_count: repliesByPost.get(id)?.total ?? 0,
        lead_refs: (row.lead_refs as CampaignFeedLeadRef[] | null) ?? [],
      };
    })
  );

  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({ id: last.id, created_at: last.created_at })
        ).toString("base64url")
      : null;

  return { posts, nextCursor, hasMore };
}

async function fetchReactionsForPosts(
  supabase: Client,
  postIds: string[]
): Promise<Map<string, CampaignFeedReaction[]>> {
  const map = new Map<string, CampaignFeedReaction[]>();
  if (!postIds.length) return map;

  const { data } = (await db(supabase)
    .from("campaign_feed_reactions")
    .select("id, post_id, emoji, user_id")
    .in("post_id", postIds)
    .is("reply_id", null)) as {
    data: Array<{ id: string; post_id: string; emoji: string; user_id: string }> | null;
  };

  const userIds = (data ?? []).map((r) => r.user_id);
  const userMap = await fetchUserMap(supabase, userIds);

  for (const r of data ?? []) {
    const list = map.get(r.post_id) ?? [];
    list.push({
      id: r.id,
      emoji: r.emoji,
      user_id: r.user_id,
      user: userMap.get(r.user_id) ?? null,
    });
    map.set(r.post_id, list);
  }

  return map;
}

async function fetchReactionsForReplies(
  supabase: Client,
  replyIds: string[]
): Promise<Map<string, CampaignFeedReaction[]>> {
  const map = new Map<string, CampaignFeedReaction[]>();
  if (!replyIds.length) return map;

  const { data } = (await db(supabase)
    .from("campaign_feed_reactions")
    .select("id, reply_id, emoji, user_id")
    .in("reply_id", replyIds)) as {
    data: Array<{ id: string; reply_id: string; emoji: string; user_id: string }> | null;
  };

  const userIds = (data ?? []).map((r) => r.user_id);
  const userMap = await fetchUserMap(supabase, userIds);

  for (const r of data ?? []) {
    const list = map.get(r.reply_id) ?? [];
    list.push({
      id: r.id,
      emoji: r.emoji,
      user_id: r.user_id,
      user: userMap.get(r.user_id) ?? null,
    });
    map.set(r.reply_id, list);
  }

  return map;
}

async function fetchRepliesForPosts(
  supabase: Client,
  postIds: string[],
  previewLimit: number
): Promise<Map<string, { replies: CampaignFeedReply[]; total: number }>> {
  const map = new Map<string, { replies: CampaignFeedReply[]; total: number }>();
  if (!postIds.length) return map;

  const { data: allReplies } = (await db(supabase)
    .from("campaign_feed_replies")
    .select("id, post_id, user_id, content, mentions, attachments, edited_at, created_at")
    .in("post_id", postIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })) as {
    data: Array<Record<string, unknown>> | null;
  };

  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const r of allReplies ?? []) {
    const pid = String(r.post_id);
    const list = grouped.get(pid) ?? [];
    list.push(r);
    grouped.set(pid, list);
  }

  const allReplyIds = (allReplies ?? []).map((r) => String(r.id));
  const [userMap, reactionsByReply] = await Promise.all([
    fetchUserMap(
      supabase,
      (allReplies ?? []).map((r) => String(r.user_id))
    ),
    fetchReactionsForReplies(supabase, allReplyIds),
  ]);

  for (const postId of postIds) {
    const rows = grouped.get(postId) ?? [];
    const preview = rows.slice(-previewLimit);
    map.set(postId, {
      total: rows.length,
      replies: await Promise.all(preview.map(async (r) => ({
        id: String(r.id),
        post_id: String(r.post_id),
        user_id: String(r.user_id),
        content: String(r.content ?? ""),
        mentions: (r.mentions as string[]) ?? [],
        attachments: await signAttachments(supabase, (r.attachments as CampaignFeedAttachment[]) ?? []),
        edited_at: (r.edited_at as string | null) ?? null,
        created_at: String(r.created_at),
        user: userMap.get(String(r.user_id)) ?? null,
        reactions: reactionsByReply.get(String(r.id)) ?? [],
      }))),
    });
  }

  return map;
}

export async function fetchPostReplies(
  supabase: Client,
  postId: string
): Promise<CampaignFeedReply[]> {
  const { data } = (await db(supabase)
    .from("campaign_feed_replies")
    .select("id, post_id, user_id, content, mentions, attachments, edited_at, created_at")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })) as {
    data: Array<Record<string, unknown>> | null;
  };

  const replyIds = (data ?? []).map((r) => String(r.id));
  const [userMap, reactionsByReply] = await Promise.all([
    fetchUserMap(supabase, (data ?? []).map((r) => String(r.user_id))),
    fetchReactionsForReplies(supabase, replyIds),
  ]);

  return Promise.all((data ?? []).map(async (r) => ({
    id: String(r.id),
    post_id: String(r.post_id),
    user_id: String(r.user_id),
    content: String(r.content ?? ""),
    mentions: (r.mentions as string[]) ?? [],
    attachments: await signAttachments(supabase, (r.attachments as CampaignFeedAttachment[]) ?? []),
    edited_at: (r.edited_at as string | null) ?? null,
    created_at: String(r.created_at),
    user: userMap.get(String(r.user_id)) ?? null,
    reactions: reactionsByReply.get(String(r.id)) ?? [],
  })));
}

export { FEED_BUCKET };
