"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import {
  DesktopOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

type DeviceItem = {
  id: string;
  device_name: string;
  browser: string | null;
  os: string | null;
  location_approx: string | null;
  status: string;
  last_seen_at: string | null;
  created_at: string;
  is_current: boolean;
};

export function ProfileDevicesCard() {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/devices/mine", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as { devices?: DeviceItem[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load devices");
      setDevices(data.devices ?? []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRename = async () => {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (!name) {
      message.warning("Enter a device name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/devices/${renamingId}/rename`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: name }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Rename failed");
      message.success("Device renamed");
      setRenamingId(null);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  };

  const removeDevice = (device: DeviceItem) => {
    Modal.confirm({
      title: "Remove this device?",
      content:
        "You'll need admin approval to use this device again." +
        (device.is_current ? " This is your current device — you'll be signed out of it." : ""),
      okText: "Remove",
      okType: "danger",
      onOk: async () => {
        const res = await fetch(`/api/devices/${device.id}/remove`, {
          method: "POST",
          credentials: "include",
        });
        const data = (await res.json()) as { error?: string; isCurrent?: boolean };
        if (!res.ok) {
          message.error(data.error ?? "Remove failed");
          return;
        }
        message.success("Device removed");
        if (data.isCurrent) {
          window.location.assign("/auth/device-pending");
          return;
        }
        await load();
      },
    });
  };

  const visible = devices.filter((d) => d.status !== "revoked" || d.is_current);

  return (
    <Card
      title={
        <Space>
          <DesktopOutlined />
          <span>My devices</span>
        </Space>
      }
      className="mt-4"
      styles={{ body: { paddingTop: 12 } }}
    >
      <Typography.Paragraph type="secondary" className="!mb-4 text-sm">
        Browsers approved to access your account. Each browser profile counts as a separate device.
      </Typography.Paragraph>

      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : visible.length === 0 ? (
        <Empty description="No devices registered yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space direction="vertical" className="w-full" size="middle">
          {visible.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Typography.Text strong>{d.device_name}</Typography.Text>
                  {d.is_current && <Tag color="blue">This device</Tag>}
                  <Tag
                    color={
                      d.status === "approved"
                        ? "green"
                        : d.status === "pending"
                          ? "gold"
                          : "default"
                    }
                  >
                    {d.status}
                  </Tag>
                </div>
                <Typography.Text type="secondary" className="text-sm block">
                  {[d.browser, d.os, d.location_approx].filter(Boolean).join(" · ") || "—"}
                </Typography.Text>
                <Typography.Text type="secondary" className="text-xs block mt-1">
                  {d.last_seen_at
                    ? `Last active ${dayjs(d.last_seen_at).fromNow()}`
                    : `Registered ${dayjs(d.created_at).fromNow()}`}
                </Typography.Text>
              </div>
              <Space>
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setRenamingId(d.id);
                    setRenameValue(d.device_name);
                  }}
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeDevice(d)}
                />
              </Space>
            </div>
          ))}
        </Space>
      )}

      <Modal
        title="Rename device"
        open={Boolean(renamingId)}
        onCancel={() => setRenamingId(null)}
        onOk={() => void saveRename()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Input
          value={renameValue}
          maxLength={80}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="e.g. Work laptop Chrome"
        />
      </Modal>
    </Card>
  );
}
