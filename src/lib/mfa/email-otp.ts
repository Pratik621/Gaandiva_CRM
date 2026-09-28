import { createHash, randomInt } from "crypto";
import { MFA_OTP_VALIDITY_MS } from "@/lib/mfa/constants";

function getOtpPepper(): string {
  return (
    process.env.MFA_OTP_PEPPER?.trim() ||
    process.env.MFA_BACKUP_CODE_PEPPER?.trim() ||
    "gandiv-mfa-otp-pepper"
  );
}

export function generateEmailOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashEmailOtpCode(code: string): string {
  return createHash("sha256")
    .update(`${code.trim()}:${getOtpPepper()}`)
    .digest("hex");
}

export function emailOtpExpiresAt(now = Date.now()): string {
  return new Date(now + MFA_OTP_VALIDITY_MS).toISOString();
}

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendMfaOtpEmail(args: {
  to: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.MFA_OTP_EMAIL_FROM?.trim() ||
    process.env.CAMPAIGN_ALERT_EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "Email delivery is not configured (RESEND_API_KEY / from address).",
    };
  }

  const subject = "Your Gandiva verification code";
  const text = `Your verification code is ${args.code}. It expires in 5 minutes. If you did not request this, ignore this email.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 12px;font-size:18px">Verification code</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px">
        Use this code to complete two-factor authentication for Gandiva. It expires in 5 minutes.
      </p>
      <p style="margin:0 0 20px;font-size:28px;letter-spacing:6px;font-weight:700">${args.code}</p>
      <p style="margin:0;color:#94a3b8;font-size:12px">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[mfa/email] Resend failed", { status: res.status, body: body.slice(0, 300) });
    return { ok: false, error: "Failed to send verification email." };
  }

  return { ok: true };
}
