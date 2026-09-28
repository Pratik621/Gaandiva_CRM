"use client";

import { Drawer, Progress, Skeleton, Table, Tag, Typography, Empty } from "antd";
import { useQuery } from "@tanstack/react-query";

const { Text, Title } = Typography;

type StatsResponse = {
  announcement: {
    id: string;
    type: string;
    title: string;
    message: string;
    is_anonymous: boolean;
    closes_at: string | null;
    created_at: string;
  };
  recipient_count: number;
  read_count: number;
  ack_count: number;
  recipients: {
    user_id: string;
    name: string;
    read_at: string | null;
    acknowledged_at: string | null;
    dismissed_at: string | null;
  }[];
  poll: {
    options: { id: string; option_text: string; votes: number }[];
    total_votes: number;
    voters: { name: string; option_text: string; voted_at: string }[] | null;
  } | null;
  error?: string;
};

type AnnouncementStatsDrawerProps = {
  announcementId: string | null;
  onClose: () => void;
};

export default function AnnouncementStatsDrawer({
  announcementId,
  onClose,
}: AnnouncementStatsDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["announcements", "stats", announcementId],
    queryFn: async (): Promise<StatsResponse> => {
      const res = await fetch(`/api/announcements/${announcementId}/stats?limit=100`, {
        credentials: "include",
      });
      const json = (await res.json()) as StatsResponse;
      if (!res.ok) throw new Error(json.error ?? "Failed to load stats");
      return json;
    },
    enabled: Boolean(announcementId),
  });

  const isAlert = data?.announcement.type === "alert";

  return (
    <Drawer
      open={Boolean(announcementId)}
      onClose={onClose}
      width={520}
      title={data?.announcement.title ?? "Announcement stats"}
    >
      {isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Recipients
              </Text>
              <Title level={4} style={{ margin: 0 }}>
                {data.recipient_count}
              </Title>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Read
              </Text>
              <Title level={4} style={{ margin: 0 }}>
                {data.read_count}
              </Title>
            </div>
            {isAlert ? (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Acknowledged
                </Text>
                <Title level={4} style={{ margin: 0 }}>
                  {data.ack_count}
                </Title>
              </div>
            ) : null}
            {data.poll ? (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Votes
                </Text>
                <Title level={4} style={{ margin: 0 }}>
                  {data.poll.total_votes}
                </Title>
              </div>
            ) : null}
          </div>

          {data.poll ? (
            <div>
              <Text strong>Poll results {data.announcement.is_anonymous ? "(anonymous)" : ""}</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {data.poll.options.map((o) => {
                  const percent =
                    data.poll!.total_votes > 0
                      ? Math.round((o.votes / data.poll!.total_votes) * 100)
                      : 0;
                  return (
                    <div key={o.id}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 13 }}>{o.option_text}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {o.votes} · {percent}%
                        </Text>
                      </div>
                      <Progress percent={percent} showInfo={false} size="small" />
                    </div>
                  );
                })}
              </div>
              {data.poll.voters ? (
                <Table
                  size="small"
                  style={{ marginTop: 12 }}
                  rowKey={(r) => `${r.name}-${r.voted_at}`}
                  dataSource={data.poll.voters}
                  pagination={{ pageSize: 8, hideOnSinglePage: true }}
                  columns={[
                    { title: "Voter", dataIndex: "name" },
                    { title: "Choice", dataIndex: "option_text" },
                    {
                      title: "When",
                      dataIndex: "voted_at",
                      render: (v: string) => new Date(v).toLocaleString(),
                    },
                  ]}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                />
              ) : null}
            </div>
          ) : null}

          <div>
            <Text strong>Recipients</Text>
            <Table
              size="small"
              style={{ marginTop: 8 }}
              rowKey="user_id"
              dataSource={data.recipients}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              columns={[
                { title: "Name", dataIndex: "name" },
                {
                  title: "Read",
                  dataIndex: "read_at",
                  render: (v: string | null) =>
                    v ? (
                      <Tag color="green">{new Date(v).toLocaleString()}</Tag>
                    ) : (
                      <Tag>Unread</Tag>
                    ),
                },
                ...(isAlert
                  ? [
                      {
                        title: "Acknowledged",
                        dataIndex: "acknowledged_at",
                        render: (v: string | null) =>
                          v ? (
                            <Tag color="green">{new Date(v).toLocaleString()}</Tag>
                          ) : (
                            <Tag color="red">Pending</Tag>
                          ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
