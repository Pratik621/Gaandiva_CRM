import type { DeviceStatus } from "@/lib/devices/constants";
import type { OrgDeviceSettings } from "@/lib/devices/settings";
import { isDeviceEnforcementActive, isDeviceGracePeriodActive } from "@/lib/devices/settings";
import { DEVICE_AUTH_PATHS } from "@/lib/devices/constants";

export type DeviceGateResult = {
  enforcementActive: boolean;
  inGracePeriod: boolean;
  needsApproval: boolean;
  isRevoked: boolean;
  status: DeviceStatus | null;
  deviceId: string | null;
};

export function evaluateDeviceGate(args: {
  settings: OrgDeviceSettings;
  deviceStatus: DeviceStatus | null;
  deviceId: string | null;
}): DeviceGateResult {
  const inGrace = isDeviceGracePeriodActive(args.settings);
  const enforcementActive = isDeviceEnforcementActive(args.settings);

  if (!args.settings.enabled || inGrace) {
    return {
      enforcementActive: false,
      inGracePeriod: inGrace,
      needsApproval: false,
      isRevoked: false,
      status: args.deviceStatus,
      deviceId: args.deviceId,
    };
  }

  const status = args.deviceStatus;
  const isRevoked = status === "revoked";
  const isApproved = status === "approved";

  return {
    enforcementActive: true,
    inGracePeriod: false,
    needsApproval: !isApproved,
    isRevoked,
    status,
    deviceId: args.deviceId,
  };
}

export function deviceRedirectPath(gate: DeviceGateResult): string | null {
  if (!gate.enforcementActive) return null;
  if (gate.isRevoked) return DEVICE_AUTH_PATHS.revoked;
  if (gate.needsApproval) return DEVICE_AUTH_PATHS.pending;
  return null;
}
