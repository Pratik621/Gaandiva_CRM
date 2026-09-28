import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { MFA_AUTH_PATHS, MFA_EXEMPT_ROLES } from "@/lib/mfa/constants";
import { normalizeRoleName, normalizeRoleNames } from "@/lib/auth/config";

type AnyClient = SupabaseClient<Database>;

export type OrgMfaSettings = {
  organizationId: string;
  enforced: boolean;
  graceEndsAt: string | null;
};

export type UserMfaEnrollmentState = {
  emailEnrolled: boolean;
  totpEnrolled: boolean;
  hasBackupCodes: boolean;
  enrolled: boolean;
};

export function isMfaExemptRole(roleNames: Array<string | null | undefined>): boolean {
  const normalized = normalizeRoleNames(roleNames);
  return MFA_EXEMPT_ROLES.some((role) => normalized.includes(normalizeRoleName(role)));
}

export async function getOrgMfaSettings(
  client: AnyClient,
  organizationId: string
): Promise<OrgMfaSettings> {
  const { data } = await client
    .from("org_mfa_settings")
    .select("organization_id, enforced, grace_ends_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const row = data as {
    organization_id: string;
    enforced: boolean;
    grace_ends_at: string | null;
  } | null;

  return {
    organizationId,
    enforced: row?.enforced ?? false,
    graceEndsAt: row?.grace_ends_at ?? null,
  };
}

export async function getUserMfaEnrollment(
  client: AnyClient,
  admin: AnyClient | null,
  userId: string
): Promise<UserMfaEnrollmentState> {
  const enrollmentClient = admin ?? client;

  const [{ data: emailRow }, { count: backupCount }] = await Promise.all([
    enrollmentClient
      .from("user_mfa_enrollment")
      .select("email_enrolled_at")
      .eq("user_id", userId)
      .maybeSingle(),
    enrollmentClient
      .from("mfa_backup_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("used_at", null),
  ]);

  const emailEnrolled = Boolean(
    (emailRow as { email_enrolled_at: string | null } | null)?.email_enrolled_at
  );

  let totpEnrolled = false;
  try {
    const { data: factors } = await client.auth.mfa.listFactors();
    totpEnrolled = (factors?.totp ?? []).some((f) => f.status === "verified");
  } catch {
    // MFA API may be unavailable during deploy — treat as not enrolled
  }

  const hasBackupCodes = (backupCount ?? 0) > 0;
  const enrolled = emailEnrolled || totpEnrolled || hasBackupCodes;

  return { emailEnrolled, totpEnrolled, hasBackupCodes, enrolled };
}

export function isGracePeriodActive(settings: OrgMfaSettings): boolean {
  if (!settings.enforced) return true;
  if (!settings.graceEndsAt) return false;
  return Date.now() < new Date(settings.graceEndsAt).getTime();
}

export function graceDaysRemaining(settings: OrgMfaSettings): number | null {
  if (!settings.enforced || !settings.graceEndsAt) return null;
  const ms = new Date(settings.graceEndsAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export type MfaGateResult = {
  mfaRequired: boolean;
  inGracePeriod: boolean;
  graceDaysRemaining: number | null;
  enrolled: boolean;
  needsSetup: boolean;
  needsChallenge: boolean;
  emailEnrolled: boolean;
  totpEnrolled: boolean;
  exempt: boolean;
};

export function evaluateMfaGate(args: {
  settings: OrgMfaSettings;
  enrollment: UserMfaEnrollmentState;
  sessionAal: string | null | undefined;
  mfaSessionValid: boolean;
  /** When true (e.g. admin role), MFA is never required. */
  exempt?: boolean;
}): MfaGateResult {
  const inGrace = isGracePeriodActive(args.settings);
  const graceDays = graceDaysRemaining(args.settings);
  const exempt = Boolean(args.exempt);
  const mfaRequired = args.settings.enforced && !exempt;
  const aal2 = args.sessionAal === "aal2" || args.mfaSessionValid;

  const needsSetup = mfaRequired && !inGrace && !args.enrollment.enrolled;
  const needsChallenge = mfaRequired && args.enrollment.enrolled && !aal2;

  return {
    mfaRequired,
    inGracePeriod: inGrace,
    graceDaysRemaining: graceDays,
    enrolled: args.enrollment.enrolled,
    needsSetup,
    needsChallenge,
    emailEnrolled: args.enrollment.emailEnrolled,
    totpEnrolled: args.enrollment.totpEnrolled,
    exempt,
  };
}

export function mfaRedirectPath(gate: Pick<MfaGateResult, "needsSetup" | "needsChallenge">): string | null {
  if (gate.needsSetup) return MFA_AUTH_PATHS.setup;
  if (gate.needsChallenge) return MFA_AUTH_PATHS.challenge;
  return null;
}

export function extractSessionMeta(claims: Record<string, unknown> | null | undefined) {
  const aal = typeof claims?.aal === "string" ? claims.aal : null;
  const sessionId =
    typeof claims?.session_id === "string"
      ? claims.session_id
      : typeof claims?.sub === "string"
        ? claims.sub
        : null;
  return { aal, sessionId };
}
