"use client";

import { useState } from "react";
import { Button, Modal, Tag, Typography, message } from "antd";
import { WarningFilled } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import {
  useAnnouncementCounts,
  useInvalidateAnnouncementCounts,
} from "@/hooks/useAnnouncementCounts";

const { Text, Paragraph } = Typography;

/**
 * Compliance gate for Alert announcements: a blocking modal that stays up
 * until every pending alert is explicitly acknowledged ("Mark as read").
 * Mounted once in CrmHeader so it covers every role layout.
 */
export default function AlertAnnouncementBanner() {
  const { user, isInitialized } = useAuth();
  const { data } = useAnnouncementCounts(Boolean(user) && isInitialized);
  const invalidate = useInvalidateAnnouncementCounts();
  const [acknowledging, setAcknowledging] = useState(false);

  const alerts = data?.alerts ?? [];
  const current = alerts[0] ?? null;
  if (!current) return null;

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    try {
      const res = await fetch(`/api/announcements/${current.id}/acknowledge`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        message.error(json.error ?? "Failed to acknowledge alert");
        return;
      }
      invalidate();
    } catch {
      message.error("Failed to acknowledge alert");
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <Modal
      open
      closable={false}
      maskClosable={false}
      keyboard={false}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <WarningFilled style={{ color: "#dc2626", fontSize: 18 }} />
          <span>Alert{alerts.length > 1 ? ` (1 of ${alerts.length})` : ""}</span>
        </span>
      }
      footer={
        <Button type="primary" danger loading={acknowledging} onClick={handleAcknowledge}>
          Mark as read
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Text strong style={{ fontSize: 15 }}>
          {current.title}
        </Text>
        {current.message ? (
          <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
            {current.message}
          </Paragraph>
        ) : null}
        <div>
          {current.sender_name ? <Tag>{current.sender_name}</Tag> : null}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(current.created_at).toLocaleString()}
          </Text>
        </div>
      </div>
    </Modal>
  );
}
