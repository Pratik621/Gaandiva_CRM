"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Alert, Button, Spin, Typography, message } from "antd";
import { DesktopOutlined, BellOutlined } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { DEVICE_STATUS_POLL_MS } from "@/lib/devices/constants";
import { ensureDeviceRegistered } from "@/lib/mfa/resolve-post-auth";

type StatusPayload = {
  status?: string;
  deviceName?: string;
  browser?: string;
  os?: string;
  location?: string;
  notifiedAdmins?: string[];
  canNotifyAgainAt?: string | null;
  rejected?: boolean;
  enforcementActive?: boolean;
  error?: string;
};

export default function DevicePendingPage() {
  const router = useRouter();
  const { isInitialized, user, getDefaultRedirect, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [declined, setDeclined] = useState(false);

  const goApproved = useCallback(() => {
    window.location.assign(getDefaultRedirect());
  }, [getDefaultRedirect]);

  const refresh = useCallback(async () => {
    try {
      let data = await ensureDeviceRegistered();
      if (!data) {
        const res = await fetch("/api/devices/status", {
          credentials: "include",
          cache: "no-store",
        });
        data = (await res.json()) as StatusPayload;
      } else {
        // Re-fetch full status for display fields
        const res = await fetch("/api/devices/status", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) data = (await res.json()) as StatusPayload;
      }

      const payload = data as StatusPayload;
      setStatus(payload);

      if (payload.status === "approved" || payload.enforcementActive === false) {
        goApproved();
        return;
      }
      if (payload.status === "revoked" || payload.rejected) {
        if (payload.rejected) {
          setDeclined(true);
        } else {
          router.replace("/auth/device-revoked");
        }
      }
    } catch {
      message.error("Could not check device status");
    } finally {
      setLoading(false);
    }
  }, [goApproved, router]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void refresh();
  }, [isInitialized, refresh, router, user]);

  useEffect(() => {
    if (!user || declined) return;
    const t = setInterval(() => {
      void refresh();
    }, DEVICE_STATUS_POLL_MS);
    return () => clearInterval(t);
  }, [declined, refresh, user]);

  const notifyAgain = async () => {
    setNotifying(true);
    try {
      const res = await fetch("/api/devices/notify-again", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as StatusPayload & {
        canNotifyAgainAt?: string;
        notifiedAdmins?: string[];
      };
      if (!res.ok) {
        message.warning(data.error ?? "Could not notify admins");
        if (data.canNotifyAgainAt) {
          setStatus((s) => ({ ...s, canNotifyAgainAt: data.canNotifyAgainAt }));
        }
        return;
      }
      message.success("Admins notified again");
      setStatus((s) => ({
        ...s,
        notifiedAdmins: data.notifiedAdmins ?? s?.notifiedAdmins,
        canNotifyAgainAt: data.canNotifyAgainAt,
      }));
    } finally {
      setNotifying(false);
    }
  };

  const canNotify =
    !status?.canNotifyAgainAt || new Date(status.canNotifyAgainAt).getTime() <= Date.now();

  const deviceLine = [
    status?.deviceName ||
      (status?.browser && status?.os ? `${status.browser} on ${status.os}` : null),
    status?.location,
  ]
    .filter(Boolean)
    .join(" · ");

  if (!isInitialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  if (declined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <Image
            src="/projects/sidebar_logo.png"
            alt="Gandiv"
            width={48}
            height={48}
            className="mx-auto mb-4"
          />
          <Typography.Title level={3} className="!mb-2">
            Device request declined
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!mb-6">
            Your device request was declined — contact your admin to regain access.
          </Typography.Paragraph>
          <Button
            block
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center mb-6">
          <Image
            src="/projects/sidebar_logo.png"
            alt="Gandiv"
            width={48}
            height={48}
            className="mx-auto mb-4"
          />
          <DesktopOutlined className="text-3xl text-indigo-600 mb-3" />
          <Typography.Title level={3} className="!mb-2">
            New device detected — approval needed
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!mb-0">
            For security, each new browser needs an admin to approve it before you can continue.
            You won&apos;t need to sign in again once approved.
          </Typography.Paragraph>
        </div>

        {deviceLine && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            message="Device being requested"
            description={deviceLine}
          />
        )}

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 mb-4 text-center">
          <Spin className="!mb-2" />
          <Typography.Text type="secondary" className="block text-sm">
            Waiting for admin approval…
          </Typography.Text>
          <Typography.Text type="secondary" className="block text-xs mt-1">
            Status updates automatically every few seconds
          </Typography.Text>
        </div>

        {status?.notifiedAdmins && status.notifiedAdmins.length > 0 && (
          <Typography.Paragraph type="secondary" className="text-sm !mb-3">
            Notified: {status.notifiedAdmins.join(", ")}
          </Typography.Paragraph>
        )}

        <Button
          icon={<BellOutlined />}
          block
          loading={notifying}
          disabled={!canNotify}
          onClick={() => void notifyAgain()}
          className="!mb-3"
        >
          {canNotify ? "Notify again" : "Notify again (available soon)"}
        </Button>

        <Button
          type="link"
          block
          onClick={() => {
            void signOut();
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
