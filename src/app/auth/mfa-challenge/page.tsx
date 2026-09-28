"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Alert, Button, Input, Radio, Space, Typography, message } from "antd";
import { MailOutlined, SafetyCertificateOutlined, KeyOutlined } from "@ant-design/icons";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { fetchMfaStatus, ensureDeviceRegistered, resolvePostAuthPath } from "@/lib/mfa/resolve-post-auth";

type Method = "email" | "totp" | "backup";

export default function MfaChallengePage() {
  const router = useRouter();
  const supabase = createClient();
  const { isInitialized, user, getDefaultRedirect } = useAuth();

  const [method, setMethod] = useState<Method>("email");
  const [code, setCode] = useState("");
  const [emailEnrolled, setEmailEnrolled] = useState(true);
  const [totpEnrolled, setTotpEnrolled] = useState(false);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void fetchMfaStatus().then((s) => {
      if (!s?.needsChallenge) {
        router.replace(getDefaultRedirect());
        return;
      }
      setEmailEnrolled(Boolean(s.emailEnrolled));
      setTotpEnrolled(Boolean(s.totpEnrolled));
      setTotpFactorId(s.totpFactorId ?? null);
      if (s.totpEnrolled) setMethod("totp");
      else if (s.emailEnrolled) setMethod("email");
    });
  }, [getDefaultRedirect, isInitialized, router, user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const finish = useCallback(async () => {
    // Hard navigation so the MFA cookie is included on the next request
    // (SPA replace can race middleware before Set-Cookie is applied).
    const device = await ensureDeviceRegistered();
    const path = resolvePostAuthPath(getDefaultRedirect(), { authenticated: true }, device);
    window.location.assign(path);
  }, [getDefaultRedirect]);

  const sendEmailOtp = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/email", { method: "POST", credentials: "include" });
      const data = (await res.json()) as { error?: string; retryAfterMs?: number };
      if (!res.ok) {
        if (res.status === 429 && data.retryAfterMs) {
          setCooldown(Math.ceil(data.retryAfterMs / 1000));
        }
        setError(data.error ?? "Failed to send code.");
        return;
      }
      message.success("Code sent.");
      setCooldown(60);
    } finally {
      setSending(false);
    }
  };

  const verifyEmail = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/email", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, mode: "challenge" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Invalid code.");
        return;
      }
      void finish();
    } finally {
      setVerifying(false);
    }
  };

  const verifyTotp = async () => {
    if (!totpFactorId) return;
    setVerifying(true);
    setError(null);
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: totpFactorId,
      });
      if (chErr || !challenge) {
        setError(chErr?.message ?? "Challenge failed.");
        return;
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: totpFactorId,
        challengeId: challenge.id,
        code,
      });
      if (vErr) {
        setError("Invalid authenticator code.");
        return;
      }
      const res = await fetch("/api/auth/mfa/totp/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "challenge" }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Verification failed.");
        return;
      }
      void finish();
    } finally {
      setVerifying(false);
    }
  };

  const verifyBackup = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/backup-codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Invalid backup code.");
        return;
      }
      void finish();
    } finally {
      setVerifying(false);
    }
  };

  const onVerify = () => {
    if (method === "email") void verifyEmail();
    else if (method === "totp") void verifyTotp();
    else void verifyBackup();
  };

  if (!isInitialized || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <Typography.Text type="secondary">Loading…</Typography.Text>
      </div>
    );
  }

  return (
    <div className="login-page min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60">
        <div className="flex justify-center mb-6">
          <Image src="/projects/gandiva_logo.png" alt="Gandiva" width={140} height={48} className="object-contain" />
        </div>

        <Typography.Title level={4} className="!mb-1 text-center">
          Verify it&apos;s you
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="text-center !mb-6">
          Complete two-factor authentication to continue.
        </Typography.Paragraph>

        {error && <Alert type="error" message={error} className="!mb-4" showIcon />}

        <Radio.Group
          value={method}
          onChange={(e) => { setMethod(e.target.value as Method); setCode(""); setError(null); }}
          className="w-full !mb-4"
        >
          <Space direction="vertical" className="w-full">
            {emailEnrolled && (
              <Radio value="email"><MailOutlined className="mr-1" /> Email code</Radio>
            )}
            {totpEnrolled && (
              <Radio value="totp"><SafetyCertificateOutlined className="mr-1" /> Authenticator app</Radio>
            )}
            <Radio value="backup"><KeyOutlined className="mr-1" /> Backup code</Radio>
          </Space>
        </Radio.Group>

        {method === "email" && (
          <Button type="link" className="!p-0 !mb-3" disabled={cooldown > 0 || sending} onClick={sendEmailOtp}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Send code to my email"}
          </Button>
        )}

        <Input
          size="large"
          className="!mb-4"
          placeholder={method === "backup" ? "XXXX-XXXX" : "6-digit code"}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />

        <Button
          type="primary"
          block
          size="large"
          loading={verifying}
          disabled={!code.trim()}
          onClick={onVerify}
        >
          Verify
        </Button>
      </div>
    </div>
  );
}
