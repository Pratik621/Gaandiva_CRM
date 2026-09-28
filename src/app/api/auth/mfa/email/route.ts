import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { logAuthEvent, getRequestMeta } from "@/lib/mfa/audit";
import {
  checkOtpSendRateLimit,
  checkOtpVerifyRateLimit,
} from "@/lib/mfa/rate-limit";
import { setMfaSessionCookie } from "@/lib/mfa/session-cookie";
import { generateBackupCodes, hashBackupCode } from "@/lib/mfa/backup-codes";
import {
  emailOtpExpiresAt,
  generateEmailOtpCode,
  hashEmailOtpCode,
  sendMfaOtpEmail,
} from "@/lib/mfa/email-otp";
import { MFA_MAX_VERIFY_ATTEMPTS } from "@/lib/mfa/constants";

export const dynamic = "force-dynamic";

async function requireAuthedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id, email, status")
    .eq("id", user.id)
    .single();

  const row = profile as {
    organization_id: string | null;
    email: string | null;
    status: string;
  } | null;

  if (!row?.organization_id) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  if (row.status === "inactive") {
    return {
      error: NextResponse.json(
        { error: "Your account has been deactivated. Contact your Team Leader." },
        { status: 403 }
      ),
    };
  }

  return {
    supabase,
    user,
    orgId: row.organization_id,
    email: row.email ?? user.email ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthedUser();
    if ("error" in auth && auth.error) return auth.error;
    const { user, orgId, email } = auth as Exclude<typeof auth, { error: NextResponse }>;

    if (!email) {
      return NextResponse.json({ error: "No email on file for this account." }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const meta = getRequestMeta(request);
    const rate = await checkOtpSendRateLimit(admin, user.id, "email");
    if (!rate.ok) {
      return NextResponse.json(
        { error: rate.reason, retryAfterMs: rate.retryAfterMs },
        { status: 429 }
      );
    }

    const code = generateEmailOtpCode();
    const codeHash = hashEmailOtpCode(code);
    const expiresAt = emailOtpExpiresAt();

    // Invalidate previous unused codes for this user
    await admin
      .from("mfa_email_otps")
      .update({ consumed_at: new Date().toISOString() } as never)
      .eq("user_id", user.id)
      .is("consumed_at", null);

    const { error: insertErr } = await admin.from("mfa_email_otps").insert({
      user_id: user.id,
      code_hash: codeHash,
      expires_at: expiresAt,
    } as never);

    if (insertErr) {
      console.error("[mfa/email/send] otp insert failed:", insertErr.message);
      return NextResponse.json({ error: "Unable to create verification code." }, { status: 500 });
    }

    const sent = await sendMfaOtpEmail({ to: email, code });
    if (!sent.ok) {
      console.error("[mfa/email/send]", sent.error);
      return NextResponse.json({ error: sent.error }, { status: 400 });
    }

    await logAuthEvent(admin, {
      organizationId: orgId,
      userId: user.id,
      eventType: "mfa_otp_send",
      channel: "email",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[mfa/email/send] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuthedUser();
    if ("error" in auth && auth.error) return auth.error;
    const { user, orgId } = auth as Exclude<typeof auth, { error: NextResponse }>;

    const body = (await request.json()) as { code?: string; mode?: "setup" | "challenge" };
    const code = body.code?.trim();
    if (!code || code.length < 6) {
      return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const meta = getRequestMeta(request);
    const rate = await checkOtpVerifyRateLimit(admin, user.id, "email");
    if (!rate.ok) {
      return NextResponse.json(
        { error: rate.reason, retryAfterMs: rate.retryAfterMs },
        { status: 429 }
      );
    }

    const { data: otpRow, error: otpFetchErr } = await admin
      .from("mfa_email_otps")
      .select("id, code_hash, expires_at, attempts, consumed_at")
      .eq("user_id", user.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const otp = otpRow as {
      id: string;
      code_hash: string;
      expires_at: string;
      attempts: number;
      consumed_at: string | null;
    } | null;

    if (otpFetchErr || !otp) {
      await logAuthEvent(admin, {
        organizationId: orgId,
        userId: user.id,
        eventType: "mfa_otp_verify_fail",
        channel: "email",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return NextResponse.json({ error: "No active code. Please request a new one." }, { status: 400 });
    }

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      await admin
        .from("mfa_email_otps")
        .update({ consumed_at: new Date().toISOString() } as never)
        .eq("id", otp.id);
      return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 400 });
    }

    if (otp.attempts >= MFA_MAX_VERIFY_ATTEMPTS) {
      await admin
        .from("mfa_email_otps")
        .update({ consumed_at: new Date().toISOString() } as never)
        .eq("id", otp.id);
      return NextResponse.json(
        { error: "Too many failed attempts. Please request a new code." },
        { status: 429 }
      );
    }

    const codeHash = hashEmailOtpCode(code);
    if (codeHash !== otp.code_hash) {
      await admin
        .from("mfa_email_otps")
        .update({ attempts: otp.attempts + 1 } as never)
        .eq("id", otp.id);

      await logAuthEvent(admin, {
        organizationId: orgId,
        userId: user.id,
        eventType: "mfa_otp_verify_fail",
        channel: "email",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
    }

    await admin
      .from("mfa_email_otps")
      .update({ consumed_at: new Date().toISOString() } as never)
      .eq("id", otp.id);

    await logAuthEvent(admin, {
      organizationId: orgId,
      userId: user.id,
      eventType: "mfa_otp_verify_success",
      channel: "email",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const mode = body.mode ?? "challenge";
    let backupCodes: string[] | undefined;

    if (mode === "setup") {
      await admin.from("user_mfa_enrollment").upsert(
        {
          user_id: user.id,
          organization_id: orgId,
          email_enrolled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id" }
      );

      await admin.from("mfa_backup_codes").delete().eq("user_id", user.id);
      backupCodes = generateBackupCodes();
      await admin.from("mfa_backup_codes").insert(
        backupCodes.map((c) => ({
          user_id: user.id,
          code_hash: hashBackupCode(c),
        })) as never
      );

      await logAuthEvent(admin, {
        organizationId: orgId,
        userId: user.id,
        eventType: "mfa_backup_codes_generated",
        channel: "email",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      await logAuthEvent(admin, {
        organizationId: orgId,
        userId: user.id,
        eventType: "mfa_setup_complete",
        channel: "email",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }

    const response = NextResponse.json({
      ok: true,
      backupCodes: mode === "setup" ? backupCodes : undefined,
    });
    setMfaSessionCookie(response, user.id);
    return response;
  } catch (err) {
    console.error("[mfa/email/verify] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
