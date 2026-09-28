export const MFA_COOKIE_NAME = "gandiv_mfa_ok";

/**
 * Roles that skip MFA setup/challenge even when org MFA is enforced.
 * Admins manage rollout and must not be locked out of the console.
 */
export const MFA_EXEMPT_ROLES = ["admin"] as const;

/** OTP validity — Supabase default is 5 min; we mirror for rate-limit windows. */
export const MFA_OTP_VALIDITY_MS = 5 * 60 * 1000;

/** Resend cooldown between OTP sends on the same channel. */
export const MFA_RESEND_COOLDOWN_MS = 60 * 1000;

/** Max OTP sends per user per channel within the rolling window. */
export const MFA_MAX_SENDS_PER_WINDOW = 3;
export const MFA_SEND_WINDOW_MS = 10 * 60 * 1000;

/** Max failed verify attempts per OTP challenge window. */
export const MFA_MAX_VERIFY_ATTEMPTS = 5;

/** Backup codes generated at MFA setup. */
export const MFA_BACKUP_CODE_COUNT = 10;

export const MFA_AUTH_PATHS = {
  setup: "/auth/mfa-setup",
  challenge: "/auth/mfa-challenge",
} as const;

export type MfaChannel = "email" | "totp" | "backup_code";

export type MfaAuthEventType =
  | "mfa_otp_send"
  | "mfa_otp_verify_success"
  | "mfa_otp_verify_fail"
  | "mfa_totp_enroll"
  | "mfa_totp_verify_success"
  | "mfa_totp_verify_fail"
  | "mfa_backup_code_used"
  | "mfa_backup_codes_generated"
  | "mfa_admin_reset"
  | "mfa_setup_complete"
  | "device_registered"
  | "device_approved"
  | "device_rejected"
  | "device_revoked"
  | "device_expired";
