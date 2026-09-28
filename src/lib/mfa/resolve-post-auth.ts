import { MFA_AUTH_PATHS } from "@/lib/mfa/constants";
import { DEVICE_AUTH_PATHS } from "@/lib/devices/constants";

export type MfaStatusResponse = {
  authenticated: boolean;
  needsSetup?: boolean;
  needsChallenge?: boolean;
  enrolled?: boolean;
  emailEnrolled?: boolean;
  totpEnrolled?: boolean;
  totpFactorId?: string | null;
  showGraceBanner?: boolean;
  graceDaysRemaining?: number | null;
};

export type DeviceStatusResponse = {
  status?: string;
  enforcementActive?: boolean;
  rejected?: boolean;
  reason?: string;
};

export async function fetchMfaStatus(): Promise<MfaStatusResponse | null> {
  try {
    const res = await fetch("/api/auth/mfa/status", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as MfaStatusResponse;
  } catch {
    return null;
  }
}

export async function fetchDeviceStatus(): Promise<DeviceStatusResponse | null> {
  try {
    const res = await fetch("/api/devices/status", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as DeviceStatusResponse;
  } catch {
    return null;
  }
}

/** Ensure a device cookie exists when enforcement/grace is on. */
export async function ensureDeviceRegistered(): Promise<DeviceStatusResponse | null> {
  try {
    const status = await fetchDeviceStatus();
    if (!status) return null;
    if (!status.enforcementActive && status.status === "approved" && status.reason === "disabled") {
      return status;
    }
    if (status.status === "missing" || !status.status) {
      const reg = await fetch("/api/devices/register", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      if (!reg.ok) return status;
      return (await reg.json()) as DeviceStatusResponse;
    }
    return status;
  } catch {
    return null;
  }
}

export function resolvePostAuthPath(
  defaultPath: string,
  mfa: MfaStatusResponse | null,
  device?: DeviceStatusResponse | null
): string {
  if (mfa?.needsSetup) return MFA_AUTH_PATHS.setup;
  if (mfa?.needsChallenge) return MFA_AUTH_PATHS.challenge;

  if (device?.enforcementActive) {
    if (device.status === "revoked" || device.rejected) {
      return DEVICE_AUTH_PATHS.revoked;
    }
    if (device.status !== "approved") {
      return DEVICE_AUTH_PATHS.pending;
    }
  }

  return defaultPath;
}
