import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import {
  evaluateMfaGate,
  extractSessionMeta,
  getOrgMfaSettings,
  getUserMfaEnrollment,
  graceDaysRemaining,
  isGracePeriodActive,
  isMfaExemptRole,
} from "@/lib/mfa/enrollment";
import { isMfaCookieValidForUser } from "@/lib/mfa/session-cookie";
import { MFA_COOKIE_NAME } from "@/lib/mfa/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id, status")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null; status: string } | null)
      ?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims as Record<string, unknown> | undefined;
    const { aal } = extractSessionMeta(claims);

    const cookieStore = await cookies();
    const mfaCookie = cookieStore.get(MFA_COOKIE_NAME)?.value;
    const mfaSessionValid = isMfaCookieValidForUser(user.id, mfaCookie);

    const [{ data: roleRows }, settings, enrollment] = await Promise.all([
      supabase.from("user_roles").select("roles(name)").eq("user_id", user.id),
      getOrgMfaSettings(supabase, orgId),
      getUserMfaEnrollment(supabase, admin, user.id),
    ]);

    const roleNames = (roleRows ?? []).map(
      (r: { roles: { name: string } | null }) => r.roles?.name
    );
    const exempt = isMfaExemptRole(roleNames);

    const gate = evaluateMfaGate({
      settings,
      enrollment,
      sessionAal: aal,
      mfaSessionValid,
      exempt,
    });

    let totpFactorId: string | null = null;
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
      totpFactorId = verified?.id ?? null;
    } catch {
      // ignore
    }

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      organizationId: orgId,
      mfaRequired: gate.mfaRequired,
      exempt,
      enforced: settings.enforced,
      inGracePeriod: gate.inGracePeriod,
      graceDaysRemaining: exempt ? null : graceDaysRemaining(settings),
      enrolled: gate.enrolled,
      emailEnrolled: gate.emailEnrolled,
      totpEnrolled: gate.totpEnrolled,
      needsSetup: gate.needsSetup,
      needsChallenge: gate.needsChallenge,
      aal,
      mfaSessionValid,
      totpFactorId,
      showGraceBanner:
        !exempt && settings.enforced && isGracePeriodActive(settings) && !gate.enrolled,
    });
  } catch (err) {
    console.error("[mfa/status] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
