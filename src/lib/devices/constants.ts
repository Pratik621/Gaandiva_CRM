export const DEVICE_COOKIE_NAME = "gandiv_device";
export const DEVICE_OK_COOKIE_NAME = "gandiv_device_ok";

export const DEVICE_COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;
export const DEVICE_OK_TTL_MS = 5 * 60 * 1000;

export const MAX_APPROVED_DEVICES = 3;
export const DEVICE_IDLE_EXPIRY_DAYS = 90;
export const DEVICE_STATUS_POLL_MS = 5_000;
export const DEVICE_NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;

export const DEVICE_AUTH_PATHS = {
  pending: "/auth/device-pending",
  revoked: "/auth/device-revoked",
} as const;

export const DEVICE_AUTH_PATH_PREFIXES = [
  DEVICE_AUTH_PATHS.pending,
  DEVICE_AUTH_PATHS.revoked,
] as const;

export type DeviceStatus = "pending" | "approved" | "revoked";

export type DeviceAuthEventType =
  | "device_registered"
  | "device_approved"
  | "device_rejected"
  | "device_revoked"
  | "device_expired";
