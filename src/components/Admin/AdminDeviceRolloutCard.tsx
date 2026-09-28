"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, InputNumber, Space, Switch, Typography, message } from "antd";
import { DesktopOutlined } from "@ant-design/icons";

export function AdminDeviceRolloutCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [graceDays, setGraceDays] = useState(7);
  const [graceEndsAt, setGraceEndsAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/device-settings", { credentials: "include" });
      const data = (await res.json()) as {
        settings?: { enabled?: boolean; grace_ends_at?: string | null };
      };
      if (res.ok && data.settings) {
        setEnabled(Boolean(data.settings.enabled));
        setGraceEndsAt(data.settings.grace_ends_at ?? null);
        if (data.settings.grace_ends_at && data.settings.enabled) {
          const ms = new Date(data.settings.grace_ends_at).getTime() - Date.now();
          const days = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
          setGraceDays(days);
        }
      }
    } catch {
      message.error("Failed to load device settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/device-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, graceDays }),
      });
      const data = (await res.json()) as {
        error?: string;
        graceEndsAt?: string | null;
        enabled?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setEnabled(Boolean(data.enabled));
      setGraceEndsAt(data.graceEndsAt ?? null);
      if (enabled && graceDays === 0) {
        message.success("Device approval required immediately on new browsers");
      } else if (enabled) {
        message.success(
          `Device whitelisting enabled with ${graceDays}-day grace (auto-approve inventory)`
        );
      } else {
        message.success("Device whitelisting disabled");
      }
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <DesktopOutlined className="text-lg text-slate-600 mt-0.5" />
        <div className="flex-1 min-w-0">
          <Typography.Title level={5} className="!mb-1">
            Device whitelisting
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!mb-3 text-sm">
            During grace, new devices are auto-approved and inventoried silently. After grace, every
            new browser needs admin approval (max 3 approved devices per user).
          </Typography.Paragraph>

          {graceEndsAt && enabled && (
            <Alert
              type={new Date(graceEndsAt).getTime() <= Date.now() ? "warning" : "info"}
              showIcon
              className="!mb-3"
              message={
                new Date(graceEndsAt).getTime() <= Date.now()
                  ? "Grace ended — new devices require admin approval"
                  : `Grace period ends ${new Date(graceEndsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
              }
            />
          )}

          <Space wrap align="center" size="large">
            <Space>
              <span className="text-sm font-medium">Enable device approval</span>
              <Switch checked={enabled} onChange={setEnabled} disabled={loading} />
            </Space>
            <Space>
              <span className="text-sm text-slate-600">Grace (days, 0 = immediate)</span>
              <InputNumber
                min={0}
                max={30}
                value={graceDays}
                onChange={(v) => setGraceDays(typeof v === "number" ? v : 0)}
                disabled={!enabled || loading}
              />
            </Space>
            <Button type="primary" loading={saving} disabled={loading} onClick={() => void save()}>
              Save device policy
            </Button>
          </Space>
        </div>
      </div>
    </div>
  );
}
