"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { isPublicPath } from "@/lib/auth/config";
import { fetchMfaStatus } from "@/lib/mfa/resolve-post-auth";
import { MFA_AUTH_PATHS } from "@/lib/mfa/constants";

/** Renders grace-period MFA banner on authenticated app routes only. */
export function MfaGraceBannerGate() {
  const pathname = usePathname() ?? "";
  if (isPublicPath(pathname)) return null;
  return <MfaGraceBanner />;
}

/**
 * Compact bar between header and page content during MFA grace period.
 */
export function MfaGraceBanner() {
  const { user, isInitialized } = useAuth();
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isInitialized || !user) {
      setVisible(false);
      return;
    }
    void fetchMfaStatus().then((s) => {
      if (s?.showGraceBanner && typeof s.graceDaysRemaining === "number") {
        setDaysLeft(s.graceDaysRemaining);
        setVisible(true);
      } else {
        setVisible(false);
      }
    });
  }, [isInitialized, user]);

  if (!visible || daysLeft === null) return null;

  return (
    <div
      className="shrink-0 mx-6 mt-3 mb-0 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5"
      role="status"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <SafetyCertificateOutlined className="text-amber-600 text-base mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold text-amber-900">
            Set up MFA — {daysLeft} day{daysLeft === 1 ? "" : "s"} left
          </p>
          <p className="m-0 mt-0.5 text-xs text-amber-800/90">
            Two-factor authentication will be required soon for all users.
          </p>
        </div>
      </div>
      <Link href={MFA_AUTH_PATHS.setup} className="shrink-0">
        <Button type="primary" size="small" className="!bg-amber-700 !border-amber-700 hover:!bg-amber-800">
          Set up now
        </Button>
      </Link>
    </div>
  );
}
