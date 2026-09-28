"use client";

import { useState } from "react";
import { Button, Card, Tabs, Typography } from "antd";
import { NotificationOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import AnnouncementInboxList from "@/components/Announcements/AnnouncementInboxList";
import SentAnnouncementsList from "@/components/Announcements/SentAnnouncementsList";
import CreateAnnouncementModal from "@/components/Announcements/CreateAnnouncementModal";
import type { PermissionRule } from "@/lib/announcements/types";

const { Title, Text } = Typography;

/**
 * Shared announcements page reused by every role area. Sender abilities are
 * data-driven from the permission matrix — never inferred from the URL.
 */
export default function AnnouncementsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const permissionsQuery = useQuery({
    queryKey: ["announcements", "permissions"],
    queryFn: async (): Promise<{ can_send: boolean; rules: PermissionRule[] }> => {
      const res = await fetch("/api/announcements/permissions", { credentials: "include" });
      const data = (await res.json()) as {
        can_send?: boolean;
        rules?: PermissionRule[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load permissions");
      return { can_send: Boolean(data.can_send), rules: data.rules ?? [] };
    },
    staleTime: 5 * 60_000,
  });

  const canSend = permissionsQuery.data?.can_send ?? false;
  const rules = permissionsQuery.data?.rules ?? [];

  return (
    <div style={{ padding: "0 4px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <NotificationOutlined style={{ marginRight: 8 }} />
            Announcements
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Notes, warnings, alerts and polls from your team
          </Text>
        </div>
        {canSend ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            New Announcement
          </Button>
        ) : null}
      </div>

      {canSend ? (
        <Card style={{ borderRadius: 12 }} styles={{ body: { paddingTop: 8 } }}>
          <Tabs
            defaultActiveKey="inbox"
            items={[
              {
                key: "inbox",
                label: "Inbox",
                children: <AnnouncementInboxList />,
              },
              {
                key: "sent",
                label: "Sent",
                children: <SentAnnouncementsList refreshToken={refreshToken} />,
              },
            ]}
          />
        </Card>
      ) : (
        <AnnouncementInboxList />
      )}

      <CreateAnnouncementModal
        open={createOpen}
        rules={rules}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setRefreshToken((t) => t + 1)}
      />
    </div>
  );
}
