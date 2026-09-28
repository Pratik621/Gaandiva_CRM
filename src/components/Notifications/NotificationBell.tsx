"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Drawer,
  Button,
  List,
  Typography,
  Space,
  Empty,
  Skeleton,
  Divider,
  notification as antNotification,
} from "antd";
import {
  BellOutlined,
  CheckOutlined,
  RocketOutlined,
  TeamOutlined,
  FileTextOutlined,
  UserAddOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { resolveAnnouncementsPath } from "@/lib/announcements/nav";
import type { RealtimeChannel } from "@supabase/supabase-js";

const { Text } = Typography;

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType = "campaign" | "task" | "lead" | "followup" | "system";
export type NotificationReferenceType =
  | "campaign"
  | "lead"
  | "task"
  | "deal"
  | "announcement"
  | "device_request";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  sender_id: string | null;
  reference_type: NotificationReferenceType | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

function groupByDate(notifications: AppNotification[]): Record<string, AppNotification[]> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;

  const groups: Record<string, AppNotification[]> = {};

  for (const n of notifications) {
    const t = new Date(n.created_at).getTime();
    const label =
      t >= todayStart ? "Today"
      : t >= yesterdayStart ? "Yesterday"
      : "Earlier";

    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }

  return groups;
}

function notifIcon(type: NotificationType) {
  const style = { fontSize: 16 };
  switch (type) {
    case "campaign":  return <RocketOutlined   style={{ ...style, color: "#4f46e5" }} />;
    case "task":      return <FileTextOutlined  style={{ ...style, color: "#f59e0b" }} />;
    case "lead":      return <UserAddOutlined   style={{ ...style, color: "#52c41a" }} />;
    case "followup":  return <TeamOutlined      style={{ ...style, color: "#722ed1" }} />;
    default:          return <BulbOutlined      style={{ ...style, color: "#6b7280" }} />;
  }
}

/** Returns true if the notification originated from the campaign feed. */
function isFeedNotification(notif: AppNotification): boolean {
  const haystack = `${notif.title} ${notif.message}`.toLowerCase();
  return /feed|repl(y|ied)|mention|reacted/.test(haystack);
}

function resolveCampaignPath(
  campaignId: string,
  isFeed: boolean,
  hasRoleFn: (role: string) => boolean
): string {
  const suffix = isFeed ? "?tab=feed" : "";
  if (hasRoleFn("admin")) {
    return `/admin/campaigns/${campaignId}${suffix}`;
  }
  if (
    hasRoleFn("client_viewer") ||
    hasRoleFn("internal_operator") ||
    hasRoleFn("internal_admin")
  ) {
    return `/dashboard/campaigns/${campaignId}${suffix}`;
  }
  if (hasRoleFn("sales_manager") || hasRoleFn("sales")) {
    return `/sales/campaigns/${campaignId}${suffix}`;
  }
  // operations_manager, team_leader, tl, admin
  return `/tl/campaigns/${campaignId}${suffix}`;
}

function resolveNavPath(
  referenceType: NotificationReferenceType | null,
  referenceId: string | null
): string | null {
  if (!referenceType || !referenceId) return null;
  switch (referenceType) {
    case "lead":  return `/sales/leads`;
    case "task":  return `/sales/tasks`;
    case "deal":  return `/sales/deals`;
    default:      return null;
  }
}


// ─── Component ───────────────────────────────────────────────────────────────

export default function NotificationBell() {
  const router = useRouter();
  const { user, hasRole } = useAuth();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const PAGE_SIZE = 20;

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchNotifications = useCallback(
    async (reset = false) => {
      if (!user) return;
      const currentOffset = reset ? 0 : offset;
      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const res = await fetch(
          `/api/notifications?limit=${PAGE_SIZE}&offset=${currentOffset}`
        );
        if (!res.ok) return;
        const json = await res.json();
        const incoming: AppNotification[] = json.notifications ?? [];

        setNotifications((prev) =>
          reset ? incoming : [...prev, ...incoming]
        );
        setUnreadCount(json.unread_count ?? 0);
        setHasMore(incoming.length === PAGE_SIZE);
        setOffset(currentOffset + incoming.length);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user, offset]
  );

  // ── Unread badge: poll count only (full list loads when drawer opens) ─────

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) return;
      const json = (await res.json()) as { unread_count?: number };
      setUnreadCount(json.unread_count ?? 0);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchUnreadCount();

    const POLL_MS = 120_000;
    let timer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") {
          void fetchUnreadCount();
        }
      }, POLL_MS);
    };

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchUnreadCount();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, fetchUnreadCount]);

  // ── Supabase Realtime subscription ────────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification;

          // Nudge announcement widgets (alert banner) without a second channel.
          if (newNotif.reference_type === "announcement") {
            window.dispatchEvent(new CustomEvent("gandiv:announcement"));
          }
          if (newNotif.reference_type === "device_request") {
            window.dispatchEvent(new CustomEvent("gandiv:device-request"));
          }

          // Prepend to list
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((c) => c + 1);

          // Toast popup
          antNotification.open({
            message: newNotif.title,
            description: newNotif.message,
            icon: notifIcon(newNotif.type),
            placement: "topRight",
            duration: 5,
            style: { borderLeft: "4px solid #4f46e5", cursor: "pointer" },
            onClick: () => {
              setOpen(true);
            },
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as AppNotification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? { ...n, is_read: updated.is_read } : n))
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const markAsRead = useCallback(
    async (notif: AppNotification) => {
      if (notif.is_read) return;

      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));

      await fetch(`/api/notifications/${notif.id}`, { method: "PATCH" }).catch(
        () => {}
      );
    },
    []
  );

  const handleNotifClick = useCallback(
    async (notif: AppNotification) => {
      await markAsRead(notif);

      let path: string | null = null;

      if (notif.reference_type === "campaign" && notif.reference_id) {
        // Navigate directly to the specific campaign detail page.
        // If feed-related, append ?tab=feed so the feed view opens immediately.
        path = resolveCampaignPath(
          notif.reference_id,
          isFeedNotification(notif),
          hasRole
        );
      } else if (notif.reference_type === "announcement") {
        path = resolveAnnouncementsPath(hasRole);
      } else if (notif.reference_type === "device_request") {
        path = notif.reference_id
          ? `/admin/devices?id=${notif.reference_id}`
          : "/admin/devices";
      } else {
        path = resolveNavPath(notif.reference_type, notif.reference_id);
      }

      if (path) {
        setOpen(false);
        router.push(path);
      }
    },
    [hasRole, markAsRead, router]
  );

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } finally {
      setMarkingAll(false);
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    void fetchNotifications(false);
  }, [fetchNotifications]);

  // ── Open drawer ───────────────────────────────────────────────────────────

  const handleOpen = useCallback(() => {
    setOpen(true);
    void fetchNotifications(true);
  }, [fetchNotifications]);

  // ── Render ────────────────────────────────────────────────────────────────

  const grouped = groupByDate(notifications);
  const dateOrder = ["Today", "Yesterday", "Earlier"];

  return (
    <>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="crm-header-icon-btn"
      >
        <Badge count={unreadCount} size="small" offset={[2, -2]} overflowCount={99} style={{ fontSize: 10 }}>
          <span className="crm-header-icon-btn__inner">
            <BellOutlined style={{ fontSize: 18, color: "#4b5563" }} />
          </span>
        </Badge>
      </button>

      {/* Drawer */}
      <Drawer
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Space>
              <BellOutlined />
              <span style={{ fontWeight: 600 }}>Notifications</span>
              {unreadCount > 0 && (
                <Badge
                  count={unreadCount}
                  style={{ backgroundColor: "#4f46e5" }}
                />
              )}
            </Space>
            {unreadCount > 0 && (
              <Button
                type="link"
                size="small"
                icon={<CheckOutlined />}
                loading={markingAll}
                onClick={handleMarkAllRead}
                style={{ padding: 0, fontSize: 12 }}
              >
                Mark all read
              </Button>
            )}
          </div>
        }
        placement="right"
        open={open}
        onClose={() => setOpen(false)}
        width={420}
        styles={{
          body: { padding: 0, overflowY: "auto" },
          header: { borderBottom: "1px solid #f0f0f0", padding: "16px 20px" },
        }}
      >
        {loading ? (
          <div style={{ padding: "8px 0" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "14px 20px", borderBottom: "1px solid #f5f5f5" }}>
                <Skeleton.Avatar active size={36} shape="circle" />
                <div style={{ flex: 1 }}>
                  <Skeleton active title={{ width: "60%", style: { marginBottom: 8 } }} paragraph={{ rows: 1, width: "85%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No notifications yet"
            style={{ paddingTop: 60 }}
          />
        ) : (
          <>
            {dateOrder.map(
              (label) =>
                grouped[label] && (
                  <div key={label}>
                    <div
                      style={{
                        padding: "10px 20px 4px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#6b7280",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        background: "#fafafa",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                    >
                      {label}
                    </div>
                    <List
                      dataSource={grouped[label]}
                      renderItem={(notif) => (
                        <List.Item
                          key={notif.id}
                          onClick={() => void handleNotifClick(notif)}
                          style={{
                            padding: "14px 20px",
                            cursor: "pointer",
                            background: notif.is_read ? "#fff" : "#eef2ff",
                            borderBottom: "1px solid #f0f0f0",
                            transition: "background 0.15s",
                            alignItems: "flex-start",
                            gap: 12,
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background =
                              notif.is_read ? "#fafafa" : "#d6ecff";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background =
                              notif.is_read ? "#fff" : "#eef2ff";
                          }}
                        >
                          {/* Icon */}
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              background: notif.is_read ? "#f5f5f5" : "#bae0ff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          >
                            {notifIcon(notif.type)}
                          </div>

                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: 8,
                              }}
                            >
                              <Text
                                strong={!notif.is_read}
                                style={{
                                  fontSize: 13,
                                  lineHeight: 1.4,
                                  color: "#262626",
                                  flex: 1,
                                }}
                              >
                                {notif.title}
                              </Text>
                              {!notif.is_read && (
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: "#4f46e5",
                                    flexShrink: 0,
                                    marginTop: 4,
                                  }}
                                />
                              )}
                            </div>
                            <Text
                              style={{
                                fontSize: 12,
                                color: "#4b5563",
                                display: "block",
                                marginTop: 3,
                                lineHeight: 1.5,
                              }}
                            >
                              {notif.message}
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                color: "#9ca3af",
                                display: "block",
                                marginTop: 5,
                              }}
                            >
                              {timeAgo(notif.created_at)}
                            </Text>
                          </div>
                        </List.Item>
                      )}
                    />
                  </div>
                )
            )}

            {hasMore && (
              <div style={{ padding: "16px", textAlign: "center" }}>
                <Button
                  type="link"
                  loading={loadingMore}
                  onClick={handleLoadMore}
                  size="small"
                >
                  Load more
                </Button>
              </div>
            )}

            {!hasMore && notifications.length > 0 && (
              <Divider style={{ margin: "12px 0", fontSize: 11, color: "#9ca3af" }}>
                All caught up
              </Divider>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
