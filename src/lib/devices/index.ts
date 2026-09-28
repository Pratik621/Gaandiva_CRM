export {
  DEVICE_AUTH_PATHS,
  DEVICE_AUTH_PATH_PREFIXES,
  DEVICE_COOKIE_NAME,
  DEVICE_OK_COOKIE_NAME,
  DEVICE_STATUS_POLL_MS,
  DEVICE_NOTIFY_COOLDOWN_MS,
  MAX_APPROVED_DEVICES,
} from "@/lib/devices/constants";
export type { DeviceStatus, DeviceAuthEventType } from "@/lib/devices/constants";
export { generateDeviceToken, hashDeviceToken } from "@/lib/devices/token";
export {
  setDeviceTokenCookie,
  setDeviceOkCookie,
  clearAllDeviceCookies,
  clearDeviceOkCookie,
  readDeviceTokenFromRequest,
} from "@/lib/devices/cookie";
export { parseUserAgent, approximateLocationFromHeaders } from "@/lib/devices/ua";
export {
  getOrgDeviceSettings,
  isDeviceGracePeriodActive,
  isDeviceEnforcementActive,
} from "@/lib/devices/settings";
export { evaluateDeviceGate, deviceRedirectPath } from "@/lib/devices/gate";
export { shouldBootstrapAutoApprove } from "@/lib/devices/bootstrap";
export { countApprovedDevices, listApprovedDevices, isAtDeviceLimit } from "@/lib/devices/limits";
export { expireStaleDevices, maybeExpireDeviceIfStale } from "@/lib/devices/expire";
export {
  notifyAdminsOfDeviceRequest,
  notifyUserOfDeviceDecision,
  getAdminDisplayNames,
} from "@/lib/devices/notify";
export { logDeviceEvent, getRequestMeta } from "@/lib/devices/audit";
export { resolveDeviceMiddlewareRedirect, lookupDeviceByToken } from "@/lib/devices/middleware-gate";
export { requireApprovedDevice } from "@/lib/devices/require-approved";
