"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Alert, Button, Input, Radio, Space, Typography, message } from "antd";
import { MailOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { fetchMfaStatus, ensureDeviceRegistered, resolvePostAuthPath } from "@/lib/mfa/resolve-post-auth";
import { MFA_AUTH_PATHS } from "@/lib/mfa/constants";

type Step = "choose" | "email" | "totp" | "backup-codes";

export default function MfaSetupPage() {
  const router = useRouter();
  const supabase = createClient();
  const { isInitialized, user, getDefaultRedirect } = useAuth();

  const [step, setStep] = useState<Step>("choose");
  const [method, setMethod] = useState<"email" | "totp">("email");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void fetchMfaStatus().then((s) => {
      if (s?.enrolled && !s.needsSetup) {
        router.replace(getDefaultRedirect());
      }
    });
  }, [getDefaultRedirect, isInitialized, router, user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const finishAndRedirect = useCallback(async () => {
    const device = await ensureDeviceRegistered();
    const path = resolvePostAuthPath(getDefaultRedirect(), { authenticated: true }, device);
    window.location.assign(path);
  }, [getDefaultRedirect]);

  const sendEmailOtp = async () => {
    setError(null);
    setSending(true);
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
      message.success("Verification code sent to your email.");
      setCooldown(60);
      setStep("email");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const verifyEmailOtp = async () => {
    setError(null);
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/mfa/email", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, mode: "setup" }),
      });
      const data = (await res.json()) as { error?: string; backupCodes?: string[] };
      if (!res.ok) {
        setError(data.error ?? "Invalid code.");
        return;
      }
      setBackupCodes(data.backupCodes ?? null);
      setStep("backup-codes");
      message.success("Email verification enabled.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const startTotpEnroll = async () => {
    setError(null);
    setVerifying(true);
    try {
      // Abandoned setup leaves an unverified factor — remove before re-enroll.
      const { data: factorList } = await supabase.auth.mfa.listFactors();
      const factors =
        (
          factorList as {
            all?: Array<{
              id: string;
              status: string;
              factor_type: string;
            }>;
          } | null
        )?.all?.filter((f) => f.factor_type === "totp") ??
        factorList?.totp ??
        [];

      if (factors.some((f) => f.status === "verified")) {
        setError(
          "An authenticator app is already linked. Use it on login, or ask an admin to reset MFA."
        );
        return;
      }

      for (const factor of factors) {
        if (factor.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }

      const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${Date.now()}`,
      });
      if (enrollErr || !data) {
        setError(enrollErr?.message ?? "Could not start authenticator setup.");
        return;
      }
      setTotpQr(data.totp.qr_code);
      setTotpSecret(data.totp.secret);
      setTotpFactorId(data.id);
      setCode("");
      setStep("totp");
    } catch {
      setError("Failed to start TOTP enrollment.");
    } finally {
      setVerifying(false);
    }
  };

  const cancelTotpSetup = async () => {
    if (totpFactorId) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: totpFactorId });
      } catch {
        // Non-fatal — next enroll will clean unverified factors
      }
    }
    setTotpQr(null);
    setTotpSecret(null);
    setTotpFactorId(null);
    setCode("");
    setError(null);
    setStep("choose");
  };

  const verifyTotpEnroll = async () => {
    if (!totpFactorId) return;
    setError(null);
    setVerifying(true);
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
        setError("Invalid authenticator code. Try again.");
        return;
      }
      const res = await fetch("/api/auth/mfa/totp/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "setup" }),
      });
      const data = (await res.json()) as { error?: string; backupCodes?: string[] };
      if (!res.ok) {
        setError(data.error ?? "Setup failed.");
        return;
      }
      setBackupCodes(data.backupCodes ?? null);
      setStep("backup-codes");
      message.success("Authenticator app linked.");
    } catch {
      setError("Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  const onChooseContinue = () => {
    if (method === "email") void sendEmailOtp();
    else void startTotpEnroll();
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
          Set up two-factor authentication
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="text-center !mb-6">
          MFA is required for your workspace. Choose how you want to verify sign-in.
        </Typography.Paragraph>

        {error && (
          <Alert type="error" message={error} className="!mb-4" showIcon />
        )}

        {step === "choose" && (
          <Space direction="vertical" size="large" className="w-full">
            <Radio.Group
              value={method}
              onChange={(e) => setMethod(e.target.value as "email" | "totp")}
              className="w-full"
            >
              <Space direction="vertical" className="w-full">
                <Radio value="email" className="!items-start w-full p-3 border rounded-xl">
                  <span className="font-medium"><MailOutlined className="mr-2" />Email code</span>
                  <div className="text-xs text-slate-500 mt-1">6-digit code sent to your work email</div>
                </Radio>
                <Radio value="totp" className="!items-start w-full p-3 border rounded-xl">
                  <span className="font-medium"><SafetyCertificateOutlined className="mr-2" />Authenticator app</span>
                  <div className="text-xs text-slate-500 mt-1">Google Authenticator, Authy, etc. (recommended)</div>
                </Radio>
              </Space>
            </Radio.Group>
            <Button type="primary" block size="large" loading={sending || verifying} onClick={onChooseContinue}>
              Continue
            </Button>
          </Space>
        )}

        {step === "email" && (
          <Space direction="vertical" size="middle" className="w-full">
            <Typography.Text>Enter the 6-digit code sent to your email.</Typography.Text>
            <Input
              size="large"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              inputMode="numeric"
            />
            <Button type="primary" block size="large" loading={verifying} disabled={code.length < 6} onClick={verifyEmailOtp}>
              Verify
            </Button>
            <Button type="link" block disabled={cooldown > 0 || sending} onClick={sendEmailOtp}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </Button>
            <Button type="text" block onClick={() => setStep("choose")}>
              Back
            </Button>
          </Space>
        )}

        {step === "totp" && (
          <Space direction="vertical" size="middle" className="w-full">
            {totpQr && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={totpQr} alt="TOTP QR code" className="w-48 h-48" />
              </div>
            )}
            {totpSecret && (
              <Typography.Text copyable className="text-xs break-all">
                Manual key: {totpSecret}
              </Typography.Text>
            )}
            <Input
              size="large"
              placeholder="6-digit app code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
            />
            <Button type="primary" block size="large" loading={verifying} disabled={code.length < 6} onClick={verifyTotpEnroll}>
              Verify & finish
            </Button>
            <Button type="text" block onClick={() => void cancelTotpSetup()}>
              Back
            </Button>
          </Space>
        )}

        {step === "backup-codes" && backupCodes && (
          <Space direction="vertical" size="middle" className="w-full">
            <Alert
              type="warning"
              showIcon
              message="Save these backup codes"
              description="Each code works once if you lose access to your primary method. Store them securely."
            />
            <div className="rounded-lg bg-slate-50 p-4 font-mono text-sm grid grid-cols-2 gap-2">
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Button type="primary" block size="large" onClick={finishAndRedirect}>
              I&apos;ve saved my codes — continue
            </Button>
          </Space>
        )}
      </div>
    </div>
  );
}
