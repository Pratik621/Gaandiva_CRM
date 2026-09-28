"use client";

import { useEffect, useState } from "react";
import { Button, Table, Tag, Typography, message } from "antd";
import { BarChartOutlined } from "@ant-design/icons";
import { usePaginatedListQuery } from "@/hooks/usePaginatedListQuery";
import AnnouncementStatsDrawer from "@/components/Announcements/AnnouncementStatsDrawer";
import type { SentAnnouncementItem } from "@/lib/announcements/types";

const { Text } = Typography;

const TYPE_COLORS: Record<string, string> = {
  note: "blue",
  warning: "orange",
  alert: "red",
  poll: "purple",
};

export default function SentAnnouncementsList({ refreshToken }: { refreshToken: number }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statsId, setStatsId] = useState<string | null>(null);

  const { items, pagination, isLoading, error, refetch } =
    usePaginatedListQuery<SentAnnouncementItem>({
      queryKeyPrefix: ["announcements", "sent"],
      url: "/api/announcements/sent",
      params: { page, limit: pageSize },
      listField: "announcements",
    });

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    if (error) {
      message.error(error instanceof Error ? error.message : "Failed to load sent announcements");
    }
  }, [error]);

  return (
    <>
      <Table<SentAnnouncementItem>
        rowKey="id"
        size="middle"
        loading={isLoading}
        dataSource={items}
        pagination={{
          current: page,
          pageSize,
          total: pagination?.total ?? 0,
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        columns={[
          {
            title: "Type",
            dataIndex: "type",
            width: 90,
            render: (t: string) => (
              <Tag color={TYPE_COLORS[t] ?? "blue"}>{t.toUpperCase()}</Tag>
            ),
          },
          {
            title: "Title",
            dataIndex: "title",
            ellipsis: true,
            render: (v: string) => <Text strong>{v}</Text>,
          },
          { title: "Audience", dataIndex: "target_summary", width: 150 },
          {
            title: "Read",
            width: 100,
            render: (_, r) => (
              <Text>
                {r.read_count}/{r.recipient_count}
              </Text>
            ),
          },
          {
            title: "Acknowledged",
            width: 120,
            render: (_, r) =>
              r.type === "alert" ? (
                <Text>
                  {r.ack_count}/{r.recipient_count}
                </Text>
              ) : (
                <Text type="secondary">—</Text>
              ),
          },
          {
            title: "Votes",
            width: 90,
            render: (_, r) =>
              r.type === "poll" ? <Text>{r.vote_count}</Text> : <Text type="secondary">—</Text>,
          },
          {
            title: "Sent",
            dataIndex: "created_at",
            width: 160,
            render: (v: string) => (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(v).toLocaleString()}
              </Text>
            ),
          },
          {
            title: "",
            width: 90,
            render: (_, r) => (
              <Button
                size="small"
                icon={<BarChartOutlined />}
                onClick={() => setStatsId(r.id)}
              >
                Stats
              </Button>
            ),
          },
        ]}
      />
      <AnnouncementStatsDrawer announcementId={statsId} onClose={() => setStatsId(null)} />
    </>
  );
}
