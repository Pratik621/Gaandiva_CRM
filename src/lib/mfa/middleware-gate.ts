import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  evaluateMfaGate,
  extractSessionMeta,
  getOrgMfaSettings,
  isMfaExemptRole,
  mfaRedirectPath,
} from "@/lib/mfa/enrollment";
import { isMfaCookieValidForUser } from "@/lib/mfa/session-cookie";
import { MFA_COOKIE_NAME } from "@/lib/mfa/constants";
import { normalizeRoleNames } from "@/lib/auth/config";

type MiddlewareSupabase = SupabaseClient<Database>;

export async function getMiddlewareMfaEnrollment(
  supabase: MiddlewareSupabase,
  userId: string
): Promise<{ emailEnrolled: boolean; totpEnrolled: boolean; hasBackupCodes: boolean; enrolled: boolean }> {
  const [{ data: emailRow }, { count }] = await Promise.all([
    supabase
      .from("user_mfa_enrollment")
      .select("email_enrolled_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("mfa_backup_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("used_at", null),
  ]);

  const emailEnrolled = Boolean(
    (emailRow as { email_enrolled_at: string | null } | null)?.email_enrolled_at
  );
  const hasBackupCodes = (count ?? 0) > 0;
  const enrolled = emailEnrolled || hasBackupCodes;

  return {
    emailEnrolled,
    totpEnrolled: hasBackupCodes && !emailEnrolled,
    hasBackupCodes,
    enrolled,
  };
}

async function resolveRoleNames(
  supabase: MiddlewareSupabase,
  userId: string,
  claims: Record<string, unknown> | null | undefined
): Promise<string[]> {
  const rawRoles = claims?.["app_roles"];
  if (Array.isArray(rawRoles) && rawRoles.length > 0) {
    return normalizeRoleNames(rawRoles.filter((r): r is string => typeof r === "string"));
  }

  const { data } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);

  return normalizeRoleNames(
    (data ?? []).map((row: { roles: { name: string } | null }) => row.roles?.name)
  );
}

export async function resolveMfaMiddlewareRedirect(
  request: NextRequest,
  supabase: MiddlewareSupabase,
  userId: string,
  claims: Record<string, unknown> | null | undefined
): Promise<string | null> {
  const roleNames = await resolveRoleNames(supabase, userId, claims);
  if (isMfaExemptRole(roleNames)) {
    return null;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", userId)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) return null;

  const settings = await getOrgMfaSettings(supabase, orgId);
  if (!settings.enforced) return null;

  const enrollment = await getMiddlewareMfaEnrollment(supabase, userId);
  const { aal } = extractSessionMeta(claims);
  const mfaCookie = request.cookies.get(MFA_COOKIE_NAME)?.value;
  const mfaSessionValid = isMfaCookieValidForUser(userId, mfaCookie);

  const gate = evaluateMfaGate({
    settings,
    enrollment: {
      ...enrollment,
      enrolled: enrollment.enrolled,
    },
    sessionAal: aal,
    mfaSessionValid,
    exempt: false,
  });

  return mfaRedirectPath(gate);
}
