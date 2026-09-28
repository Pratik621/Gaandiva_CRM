import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  MFA_MAX_SENDS_PER_WINDOW,
  MFA_MAX_VERIFY_ATTEMPTS,
  MFA_RESEND_COOLDOWN_MS,
  MFA_SEND_WINDOW_MS,
} from "@/lib/mfa/constants";

type AdminClient = SupabaseClient<Database>;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number; reason: string };

export async function checkOtpSendRateLimit(
  admin: AdminClient,
  userId: string,
  channel: string
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - MFA_SEND_WINDOW_MS).toISOString();

  const { data: recentSends, error } = await admin
    .from("auth_events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("event_type", "mfa_otp_send")
    .eq("channel", channel)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[mfa] rate limit query failed:", error.message);
    return { ok: true };
  }

  const sends = (recentSends ?? []) as { created_at: string }[];
  if (sends.length >= MFA_MAX_SENDS_PER_WINDOW) {
    const oldest = sends[sends.length - 1]?.created_at;
    const retryAfterMs = oldest
      ? Math.max(0, MFA_SEND_WINDOW_MS - (Date.now() - new Date(oldest).getTime()))
      : MFA_SEND_WINDOW_MS;
    return {
      ok: false,
      retryAfterMs,
      reason: "Too many verification codes sent. Please try again later.",
    };
  }

  const lastSend = sends[0]?.created_at;
  if (lastSend) {
    const elapsed = Date.now() - new Date(lastSend).getTime();
    if (elapsed < MFA_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        retryAfterMs: MFA_RESEND_COOLDOWN_MS - elapsed,
        reason: "Please wait before requesting another code.",
      };
    }
  }

  return { ok: true };
}

export async function checkOtpVerifyRateLimit(
  admin: AdminClient,
  userId: string,
  channel: string
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - MFA_SEND_WINDOW_MS).toISOString();

  const { count, error } = await admin
    .from("auth_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "mfa_otp_verify_fail")
    .eq("channel", channel)
    .gte("created_at", since);

  if (error) {
    console.error("[mfa] verify rate limit query failed:", error.message);
    return { ok: true };
  }

  if ((count ?? 0) >= MFA_MAX_VERIFY_ATTEMPTS) {
    return {
      ok: false,
      retryAfterMs: MFA_SEND_WINDOW_MS,
      reason: "Too many failed attempts. Please request a new code.",
    };
  }

  return { ok: true };
}
