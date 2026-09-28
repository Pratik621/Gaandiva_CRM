import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { DeviceStatus } from "@/lib/devices/constants";
import { DEVICE_OK_COOKIE_NAME } from "@/lib/devices/constants";
import {
  isDeviceOkCookieValid,
  readDeviceTokenFromRequest,
} from "@/lib/devices/cookie";
import { hashDeviceToken } from "@/lib/devices/token";
import { getOrgDeviceSettings } from "@/lib/devices/settings";
import { deviceRedirectPath, evaluateDeviceGate } from "@/lib/devices/gate";

type MiddlewareSupabase = SupabaseClient<Database>;

type TrustedDeviceRow = {
  id: string;
  organization_id: string;
  user_id: string;
  status: string;
  last_seen_at: string | null;
};

export async function lookupDeviceByToken(
  client: MiddlewareSupabase,
  userId: string,
  token: string
): Promise<TrustedDeviceRow | null> {
  const tokenHash = hashDeviceToken(token);
  const { data } = await client
    .from("trusted_devices")
    .select("id, organization_id, user_id, status, last_seen_at")
    .eq("user_id", userId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  return (data as TrustedDeviceRow | null) ?? null;
}

/**
 * Middleware device gate. Returns redirect path or null to continue.
 * Uses short-lived device_ok cookie to skip DB on most requests.
 * Expiry / last_seen updates happen in API routes (not Edge middleware).
 */
export async function resolveDeviceMiddlewareRedirect(
  request: NextRequest,
  supabase: MiddlewareSupabase,
  userId: string,
  options?: { forceRecheck?: boolean }
): Promise<{ redirect: string | null; refreshOkCookie?: { deviceId: string } }> {
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", userId)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) return { redirect: null };

  const settings = await getOrgDeviceSettings(supabase, orgId);
  if (!settings.enabled) return { redirect: null };

  const gateOff = evaluateDeviceGate({
    settings,
    deviceStatus: null,
    deviceId: null,
  });
  if (!gateOff.enforcementActive) return { redirect: null };

  const token = readDeviceTokenFromRequest(request);
  if (!token) {
    return {
      redirect: deviceRedirectPath(
        evaluateDeviceGate({ settings, deviceStatus: null, deviceId: null })
      ),
    };
  }

  const okRaw = request.cookies.get(DEVICE_OK_COOKIE_NAME)?.value;
  if (!options?.forceRecheck && okRaw) {
    try {
      const body = okRaw.split(".")[0];
      if (body) {
        const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
          uid?: string;
          did?: string;
          exp?: number;
        };
        if (
          payload.uid === userId &&
          payload.did &&
          payload.exp &&
          Date.now() <= payload.exp &&
          isDeviceOkCookieValid(userId, payload.did, okRaw)
        ) {
          return { redirect: null };
        }
      }
    } catch {
      // fall through to DB check
    }
  }

  const device = await lookupDeviceByToken(supabase, userId, token);
  if (!device) {
    return {
      redirect: deviceRedirectPath(
        evaluateDeviceGate({ settings, deviceStatus: null, deviceId: null })
      ),
    };
  }

  const status = device.status as DeviceStatus;
  const gate = evaluateDeviceGate({
    settings,
    deviceStatus: status,
    deviceId: device.id,
  });

  const redirect = deviceRedirectPath(gate);
  if (redirect) return { redirect };

  return {
    redirect: null,
    refreshOkCookie: status === "approved" ? { deviceId: device.id } : undefined,
  };
}
