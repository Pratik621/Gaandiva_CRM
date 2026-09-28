"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Pagination,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import {
  BellOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  SoundOutlined,
  WarningOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import { usePaginatedListQuery } from "@/hooks/usePaginatedListQuery";
import { useInvalidateAnnouncementCounts } from "@/hooks/useAnnouncementCounts";
import PollVotingCard from "@/components/Announcements/PollVotingCard";
import type {
  AnnouncementInboxCounts,
  AnnouncementInboxItem,
  AnnouncementType,
} from "@/lib/announcements/types";

const { Text, Paragraph } = Typography;

const TYPE_META: Record<
  AnnouncementType,
  { label: string; color: string; icon: React.ReactNode }
> = {
  note: { label: "Note", color: "blue", icon: <BellOutlined /> },
  warning: { label: "Warning", color: "orange", icon: <WarningOutlined /> },
  alert: { label: "Alert", color: "red", icon: <SoundOutlined /> },
  poll: { label: "Poll", color: "purple", icon: <BarChartOutlined /> },
};

export default function AnnouncementInboxList() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const invalidateCounts = useInvalidateAnnouncementCounts();

  const { items, pagination, response, isLoading, error, refetch } =
    usePaginatedListQuery<AnnouncementInboxItem>({
      queryKeyPrefix: ["announcements", "inbox"],
      url: "/api/announcements",
      params: {
        page,
        limit: pageSize,
        type: typeFilter === "all" ? undefined : typeFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      },
      listField: "announcements",
    });

  const counts = (response?.counts ?? undefined) as AnnouncementInboxCounts | undefined;

  useEffect(() => {
    if (error) {
      message.error(error instanceof Error ? error.message : "Failed to load announcements");
    }
  }, [error]);

  // Visible unread items get their read timestamp stamped once.
  const unreadIds = useMemo(
    () => items.filter((i) => !i.read_at && !i.dismissed_at).map((i) => i.id),
    [items]
  );
  useEffect(() => {
    if (unreadIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const id of unreadIds) {
        if (cancelled) return;
        await fetch(`/api/announcements/${id}/read`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
      }
      if (!cancelled) {
        void refetch();
        invalidateCounts(); // clears the header announcement badge
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadIds.join(",")]);

  const handleAction = async (id: string, action: "acknowledge" | "dismiss") => {
    try {
      const res = await fetch(`/api/announcements/${id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        message.error(json.error ?? `Failed to ${action}`);
        return;
      }
      invalidateCounts();
      void refetch();
    } catch {
      message.error(`Failed to ${action}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Select
          value={typeFilter}
          onChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
          style={{ width: 140 }}
          options={[
            { value: "all", label: "All types" },
            { value: "note", label: "Notes" },
            { value: "warning", label: "Warnings" },
            { value: "alert", label: "Alerts" },
            { value: "poll", label: "Polls" },
          ]}
        />
        <Select
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          style={{ width: 160 }}
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread" },
            { value: "pending", label: "Pending action" },
          ]}
        />
        {counts ? (
          <Space size={12}>
            <Badge count={counts.unread} color="#4f46e5" overflowCount={99}>
              <Tag>Unread</Tag>
            </Badge>
            <Badge count={counts.pending_ack} color="#dc2626" overflowCount={99}>
              <Tag>Alerts pending</Tag>
            </Badge>
            <Badge count={counts.pending_votes} color="#722ed1" overflowCount={99}>
              <Tag>Polls pending</Tag>
            </Badge>
          </Space>
        ) : null}
      </div>

      {isLoading && items.length === 0 ? (
        <Card>
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <Empty description="No announcements" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        items.map((item) => {
          const meta = TYPE_META[item.type] ?? TYPE_META.note;
          const isUnread = !item.read_at;
          const needsAck = item.type === "alert" && !item.acknowledged_at;
          const canDismiss =
            item.type !== "alert" &&
            !item.dismissed_at &&
            (item.type !== "poll" || Boolean(item.my_vote_option_id) || item.is_closed);

          return (
            <Card
              key={item.id}
              size="small"
              style={{
                borderRadius: 12,
                borderLeft: `4px solid ${
                  meta.color === "red"
                    ? "#dc2626"
                    : meta.color === "orange"
                    ? "#f59e0b"
                    : meta.color === "purple"
                    ? "#722ed1"
                    : "#4f46e5"
                }`,
                background: isUnread ? "#f8faff" : "#ffffff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={8} wrap>
                    <Tag color={meta.color} icon={meta.icon}>
                      {meta.label}
                    </Tag>
                    <Text strong style={{ fontSize: 14 }}>
                      {item.title}
                    </Text>
                    {isUnread && <Badge status="processing" text="New" />}
                  </Space>
                  {item.message ? (
                    <Paragraph
                      style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", fontSize: 13 }}
                    >
                      {item.message}
                    </Paragraph>
                  ) : null}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {item.sender_name ?? "—"} · {new Date(item.created_at).toLocaleString()}
                  </Text>
                  {item.type === "poll" ? (
                    <div style={{ marginTop: 10 }}>
                      <PollVotingCard
                        item={item}
                        onVoted={() => {
                          invalidateCounts();
                          void refetch();
                        }}
                      />
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  {needsAck ? (
                    <Button
                      type="primary"
                      danger
                      size="small"
                      icon={<CheckCircleOutlined />}
                      onClick={() => void handleAction(item.id, "acknowledge")}
                    >
                      Mark as read
                    </Button>
                  ) : item.type === "alert" ? (
                    <Tag color="green" icon={<CheckCircleOutlined />}>
                      Acknowledged
                    </Tag>
                  ) : null}
                  {canDismiss ? (
                    <Button
                      size="small"
                      icon={<CloseOutlined />}
                      onClick={() => void handleAction(item.id, "dismiss")}
                    >
                      Dismiss
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })
      )}

      {(pagination?.total ?? 0) > pageSize ? (
        <Pagination
          current={page}
          pageSize={pageSize}
          total={pagination?.total ?? 0}
          onChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
          showSizeChanger
          style={{ alignSelf: "flex-end" }}
        />
      ) : null}

      {error ? (
        <Alert
          type="error"
          showIcon
          message="Announcements could not be loaded"
          action={
            <Button size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
