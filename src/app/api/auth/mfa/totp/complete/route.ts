import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { logAuthEvent, getRequestMeta } from "@/lib/mfa/audit";
import { generateBackupCodes, hashBackupCode } from "@/lib/mfa/backup-codes";
import { setMfaSessionCookie } from "@/lib/mfa/session-cookie";

export const dynamic = "force-dynamic";

/**
 * Called after client-side TOTP enroll + verify, or TOTP challenge verify.
 * Generates backup codes on setup; sets MFA session cookie on success.
 */
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

    const body = (await request.json()) as { mode?: "setup" | "challenge" };
    const mode = body.mode ?? "challenge";
    const meta = getRequestMeta(request);

    // Confirm TOTP factor is verified (AAL2 or verified factor exists)
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerifiedTotp = (factors?.totp ?? []).some((f) => f.status === "verified");

    if (!hasVerifiedTotp && aalData?.currentLevel !== "aal2") {
      return NextResponse.json({ error: "TOTP verification required." }, { status: 400 });
    }

    let backupCodes: string[] | undefined;

    if (mode === "setup") {
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
        channel: "totp",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      await logAuthEvent(admin, {
        organizationId: orgId,
        userId: user.id,
        eventType: "mfa_totp_enroll",
        channel: "totp",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      await logAuthEvent(admin, {
        organizationId: orgId,
        userId: user.id,
        eventType: "mfa_setup_complete",
        channel: "totp",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    } else {
      await logAuthEvent(admin, {
        organizationId: orgId,
        userId: user.id,
        eventType: "mfa_totp_verify_success",
        channel: "totp",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }

    const response = NextResponse.json({
      ok: true,
      backupCodes: mode === "setup" ? backupCodes : undefined,
      aal: aalData?.currentLevel ?? "aal2",
    });
    setMfaSessionCookie(response, user.id);
    return response;
  } catch (err) {
    console.error("[mfa/totp/complete] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
