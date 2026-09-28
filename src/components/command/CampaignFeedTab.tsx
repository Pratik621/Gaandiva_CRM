"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  Collapse,
  DatePicker,
  Empty,
  Input,
  Select,
  Skeleton,
  Space,
  Spin,
  Typography,
  message,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useAuth } from "@/context/AuthContext";
import { useAuthReady } from "@/hooks/useAuthReady";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";
import { createClient } from "@/lib/supabase/client";
import { canDeleteAnyFeedPost } from "@/lib/command/campaign-feed-access";
import type {
  CampaignFeedActivityEntry,
  CampaignFeedMember,
  CampaignFeedPost,
} from "@/lib/command/campaign-feed-types";
import { FEED_FILTER_OPTIONS } from "@/lib/command/campaign-feed-types";
import FeedComposer from "./feed/FeedComposer";
import FeedPostCard from "./feed/FeedPostCard";
import { FeedTimestamp, FeedUserAvatar } from "./feed/feed-utils";

const { Text } = Typography;
const { RangePicker } = DatePicker;

type CampaignFeedTabProps = {
  campaignId: string;
  fullPage?: boolean;
  /** `chat` = compact Instagram-style panel (no filters). `full` = default with filters. */
  variant?: "full" | "chat";
};

export default function CampaignFeedTab({
  campaignId,
  fullPage = false,
  variant = "full",
}: CampaignFeedTabProps) {
  const isChat = variant === "chat";
  const { user, roles } = useAuth();
  const authReady = useAuthReady();
  const [posts, setPosts] = useState<CampaignFeedPost[]>([]);
  const [members, setMembers] = useState<CampaignFeedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterUserId, setFilterUserId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [activity, setActivity] = useState<CampaignFeedActivityEntry[]>([]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const refreshGenRef = useRef(0);

  const roleNames = roles.map((r) =>
    typeof r === "string" ? r : (r.role_name ?? r.name ?? "")
  );
  const canModerate = canDeleteAnyFeedPost(roleNames);

  const buildQuery = useCallback(
    (cursor?: string | null) => {
      const sp = new URLSearchParams();
      sp.set("limit", "20");
      if (cursor) sp.set("cursor", cursor);
      if (debouncedSearch) sp.set("search", debouncedSearch);
      if (filterUserId) sp.set("user_id", filterUserId);
      if (filterType !== "all") sp.set("post_type", filterType);
      if (dateRange?.[0]) sp.set("date_from", dateRange[0].format("YYYY-MM-DD"));
      if (dateRange?.[1]) sp.set("date_to", dateRange[1].format("YYYY-MM-DD"));
      return sp.toString();
    },
    [debouncedSearch, filterUserId, filterType, dateRange]
  );

  const fetchPosts = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const gen = ++refreshGenRef.current;
      if (opts?.append) setLoadingMore(true);
      else setLoading(true);

      try {
        const qs = buildQuery(opts?.cursor);
        const res = await fetchWithAuthRetry(
          `/api/command/campaigns/${campaignId}/feed?${qs}`
        );
        const data = (await res.json()) as {
          posts?: CampaignFeedPost[];
          nextCursor?: string | null;
          hasMore?: boolean;
          error?: string;
        };
        if (gen !== refreshGenRef.current) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to load feed");

        setPosts((prev) =>
          opts?.append ? [...prev, ...(data.posts ?? [])] : (data.posts ?? [])
        );
        setNextCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.hasMore));
      } catch (e) {
        if (gen === refreshGenRef.current) {
          message.error(e instanceof Error ? e.message : "Failed to load feed");
        }
      } finally {
        if (gen === refreshGenRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [campaignId, buildQuery]
  );

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/members`
      );
      const data = (await res.json()) as { members?: CampaignFeedMember[] };
      if (res.ok) setMembers(data.members ?? []);
    } catch {
      /* non-blocking */
    }
  }, [campaignId]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/activity?limit=20`
      );
      const data = (await res.json()) as { activity?: CampaignFeedActivityEntry[] };
      if (res.ok) setActivity(data.activity ?? []);
    } catch {
      /* non-blocking */
    }
  }, [campaignId]);

  const refresh = useCallback(() => {
    void fetchPosts();
    void fetchActivity();
  }, [fetchPosts, fetchActivity]);

  // Optimistic delete: mark the post locally so the tombstone shows immediately.
  // RLS filters deleted posts on re-fetch, so we avoid calling refresh.
  const handlePostDeleted = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, deleted_at: new Date().toISOString() } : p
      )
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!authReady) return;
    void fetchPosts();
    void fetchMembers();
    void fetchActivity();
  }, [authReady, fetchPosts, fetchMembers, fetchActivity]);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`campaign-feed:${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaign_feed",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => void fetchPosts()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaign_feed_replies",
        },
        () => void fetchPosts()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaign_feed_reactions",
        },
        () => void fetchPosts()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, campaignId, fetchPosts]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && nextCursor && !loadingMore) {
          void fetchPosts({ append: true, cursor: nextCursor });
        }
      },
      {
        root: isChat ? scrollRootRef.current : null,
        rootMargin: "200px",
      }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, fetchPosts, isChat]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: isChat ? "100%" : fullPage ? "calc(100vh - 200px)" : 520,
        minHeight: 0,
      }}
    >
      {!isChat && (
      <Card
        size="small"
        style={{ marginBottom: 12, borderRadius: 10 }}
        styles={{ body: { padding: "12px 16px" } }}
      >
        <Space wrap style={{ width: "100%" }}>
          <Input
            allowClear
            placeholder="Search posts…"
            prefix={<SearchOutlined style={{ color: "#9ca3af" }} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            placeholder="Filter by user"
            style={{ width: 180 }}
            value={filterUserId}
            onChange={setFilterUserId}
            options={members.map((m) => ({
              value: m.id,
              label: m.full_name ?? m.email ?? m.id,
            }))}
          />
          <Select
            value={filterType}
            onChange={setFilterType}
            style={{ width: 150 }}
            options={FEED_FILTER_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
          <RangePicker
            value={dateRange}
            onChange={(vals) => setDateRange(vals)}
            style={{ width: 260 }}
          />
          <button
            type="button"
            onClick={() => void fetchPosts()}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: "1px solid #d9d9d9",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Apply
          </button>
        </Space>
      </Card>
      )}

      {!isChat && activity.length > 0 && (
        <Collapse
          size="small"
          style={{ marginBottom: 12 }}
          items={[
            {
              key: "activity",
              label: "Recent activity",
              children: (
                <div
                  style={{
                    maxHeight: 5 * 57, // ~5 items visible
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                >
                <Space direction="vertical" style={{ width: "100%" }} size={8}>
                  {activity.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "6px 0",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                    >
                      <FeedUserAvatar user={entry.actor} size={24} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13 }}>
                          <Text strong>{entry.actor?.full_name ?? "User"}</Text>{" "}
                          {entry.action.replace(/_/g, " ")}
                        </Text>
                        <div>
                          <FeedTimestamp value={entry.created_at} />
                        </div>
                      </div>
                    </div>
                  ))}
                </Space>
                </div>
              ),
            },
          ]}
        />
      )}

      <div
        ref={scrollRootRef}
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: isChat ? 0 : 12,
          minHeight: 0,
          background: isChat ? "#fff" : undefined,
        }}
        className={isChat ? "feed-chat-widget__scroll" : undefined}
      >
        {loading && posts.length === 0 ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : posts.length === 0 ? (
          <Empty
            description="No posts yet — start the conversation"
            style={{ padding: "48px 0" }}
          />
        ) : (
          posts.map((post) => (
            <FeedPostCard
              key={post.id}
              campaignId={campaignId}
              post={post}
              members={members}
              currentUserId={user?.id ?? ""}
              canModerate={canModerate}
              onRefresh={refresh}
              onDeleted={handlePostDeleted}
            />
          ))
        )}

        <div ref={loadMoreRef} style={{ height: 24, textAlign: "center" }}>
          {loadingMore && <Spin size="small" />}
          {!hasMore && posts.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              End of feed
            </Text>
          )}
        </div>
      </div>

      <div
        className={isChat ? "feed-chat-widget__composer" : undefined}
        style={isChat ? { flexShrink: 0, borderTop: "1px solid #f0f0f0" } : undefined}
      >
        <FeedComposer
          campaignId={campaignId}
          members={members}
          onPosted={refresh}
          compact={isChat}
        />
      </div>
    </div>
  );
}
