import { createHash, randomBytes } from "crypto";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const PASSWORD_RESET_MAX_SENDS = 3;
export const PASSWORD_RESET_SEND_WINDOW_MS = 10 * 60 * 1000;
export const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
export const PASSWORD_MIN_LENGTH = 6;

function getResetPepper(): string {
  return (
    process.env.PASSWORD_RESET_PEPPER?.trim() ||
    process.env.MFA_BACKUP_CODE_PEPPER?.trim() ||
    "gandiv-password-reset-pepper"
  );
}

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256")
    .update(`${token.trim()}:${getResetPepper()}`)
    .digest("hex");
}

export function passwordResetExpiresAt(now = Date.now()): string {
  return new Date(now + PASSWORD_RESET_TTL_MS).toISOString();
}

function getAppBaseUrl(requestOrigin?: string | null): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (requestOrigin?.startsWith("http")) return requestOrigin.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendPasswordResetEmail(args: {
  to: string;
  token: string;
  origin?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.MFA_OTP_EMAIL_FROM?.trim() ||
    process.env.CAMPAIGN_ALERT_EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "Email delivery is not configured.",
    };
  }

  const resetUrl = `${getAppBaseUrl(args.origin)}/auth/reset-password?token=${encodeURIComponent(args.token)}`;
  const subject = "Reset your Gandiva password";
  const text = `Reset your password using this link (valid for 30 minutes):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 12px;font-size:18px">Reset your password</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px">
        We received a request to reset your Gandiva password. This link expires in 30 minutes.
      </p>
      <p style="margin:0 0 20px">
        <a href="${resetUrl}" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">
          Reset password
        </a>
      </p>
      <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;word-break:break-all">${resetUrl}</p>
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
    console.error("[password-reset] Resend failed", {
      status: res.status,
      body: body.slice(0, 300),
    });
    return { ok: false, error: "Failed to send reset email." };
  }

  return { ok: true };
}
