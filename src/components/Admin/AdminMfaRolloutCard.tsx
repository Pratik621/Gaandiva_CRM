"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, InputNumber, Space, Switch, Typography, message } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";

export function AdminMfaRolloutCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enforced, setEnforced] = useState(false);
  const [graceDays, setGraceDays] = useState(7);
  const [graceEndsAt, setGraceEndsAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mfa-settings", { credentials: "include" });
      const data = (await res.json()) as {
        settings?: { enforced?: boolean; grace_ends_at?: string | null };
      };
      if (res.ok && data.settings) {
        setEnforced(Boolean(data.settings.enforced));
        setGraceEndsAt(data.settings.grace_ends_at ?? null);
        if (data.settings.grace_ends_at && data.settings.enforced) {
          const ms = new Date(data.settings.grace_ends_at).getTime() - Date.now();
          const days = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
          setGraceDays(days);
        }
      }
    } catch {
      message.error("Failed to load MFA settings");
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
      const res = await fetch("/api/admin/mfa-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enforced, graceDays }),
      });
      const data = (await res.json()) as {
        error?: string;
        graceEndsAt?: string | null;
        enforced?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setEnforced(Boolean(data.enforced));
      setGraceEndsAt(data.graceEndsAt ?? null);
      if (enforced && graceDays === 0) {
        message.success("MFA required immediately — users must set up on next login");
      } else if (enforced) {
        message.success(`MFA enabled with ${graceDays}-day grace period`);
      } else {
        message.success("MFA enforcement disabled");
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
        <SafetyCertificateOutlined className="text-lg text-slate-600 mt-0.5" />
        <div className="flex-1 min-w-0">
          <Typography.Title level={5} className="!mb-1">
            MFA rollout
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!mb-3 text-sm">
            During grace, users can still log in with password only and see a banner.
            OTP / authenticator is asked after they set up MFA, or immediately when grace is{" "}
            <strong>0</strong>. <strong>Admin</strong> accounts are exempt from MFA.
          </Typography.Paragraph>

          {graceEndsAt && enforced && (
            <Alert
              type={new Date(graceEndsAt).getTime() <= Date.now() ? "warning" : "info"}
              showIcon
              className="!mb-3"
              message={
                new Date(graceEndsAt).getTime() <= Date.now()
                  ? "Grace ended — MFA setup is required on next login"
                  : `Grace period ends ${new Date(graceEndsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
              }
            />
          )}

          <Space wrap align="center" size="large">
            <Space>
              <span className="text-sm font-medium">Enforce MFA</span>
              <Switch checked={enforced} onChange={setEnforced} disabled={loading} />
            </Space>
            <Space>
              <span className="text-sm text-slate-600">Grace (days, 0 = immediate)</span>
              <InputNumber
                min={0}
                max={30}
                value={graceDays}
                onChange={(v) => setGraceDays(typeof v === "number" ? v : 0)}
                disabled={!enforced || loading}
              />
            </Space>
            <Button type="primary" loading={saving} disabled={loading} onClick={save}>
              Save MFA policy
            </Button>
          </Space>
        </div>
      </div>
    </div>
  );
}
