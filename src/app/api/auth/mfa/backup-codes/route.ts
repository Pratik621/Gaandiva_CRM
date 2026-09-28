import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { logAuthEvent, getRequestMeta } from "@/lib/mfa/audit";
import { hashBackupCode, normalizeBackupCodeInput } from "@/lib/mfa/backup-codes";
import { setMfaSessionCookie } from "@/lib/mfa/session-cookie";
import { checkOtpVerifyRateLimit } from "@/lib/mfa/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const body = (await request.json()) as { code?: string };
    const normalized = normalizeBackupCodeInput(body.code ?? "");
    if (!normalized) {
      return NextResponse.json({ error: "Enter a backup code." }, { status: 400 });
    }

    const meta = getRequestMeta(request);
    const rate = await checkOtpVerifyRateLimit(admin, user.id, "backup_code");
    if (!rate.ok) {
      return NextResponse.json({ error: rate.reason }, { status: 429 });
    }

    const codeHash = hashBackupCode(normalized);
    const { data: match, error: fetchErr } = await admin
      .from("mfa_backup_codes")
      .select("id")
      .eq("user_id", user.id)
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .maybeSingle();

    if (fetchErr || !match) {
      await logAuthEvent(admin, {
        organizationId: orgId,
        userId: user.id,
        eventType: "mfa_otp_verify_fail",
        channel: "backup_code",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return NextResponse.json({ error: "Invalid backup code." }, { status: 400 });
    }

    await admin
      .from("mfa_backup_codes")
      .update({ used_at: new Date().toISOString() } as never)
      .eq("id", (match as { id: string }).id);

    await logAuthEvent(admin, {
      organizationId: orgId,
      userId: user.id,
      eventType: "mfa_backup_code_used",
      channel: "backup_code",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const response = NextResponse.json({ ok: true });
    setMfaSessionCookie(response, user.id);
    return response;
  } catch (err) {
    console.error("[mfa/backup-codes] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
