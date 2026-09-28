import { NextResponse, type NextRequest } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { getDeviceApiUser } from "@/lib/devices/api-auth";
import {
  readDeviceTokenFromRequest,
  lookupDeviceByToken,
  setDeviceOkCookie,
  getOrgDeviceSettings,
  isDeviceEnforcementActive,
  getAdminDisplayNames,
  DEVICE_NOTIFY_COOLDOWN_MS,
  maybeExpireDeviceIfStale,
} from "@/lib/devices";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getDeviceApiUser();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { supabase, user, orgId } = ctx as Exclude<
      Awaited<ReturnType<typeof getDeviceApiUser>>,
      { error: NextResponse }
    >;

    const settings = await getOrgDeviceSettings(supabase, orgId);
    if (!settings.enabled) {
      return NextResponse.json({
        status: "approved",
        enforcementActive: false,
        reason: "disabled",
      });
    }

    const token = readDeviceTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({
        status: "missing",
        enforcementActive: isDeviceEnforcementActive(settings),
      });
    }

    const device = await lookupDeviceByToken(supabase, user.id, token);
    if (!device) {
      return NextResponse.json({
        status: "missing",
        enforcementActive: isDeviceEnforcementActive(settings),
      });
    }

    const admin = getAdminClientSafe();
    if (admin) {
      const expired = await maybeExpireDeviceIfStale(admin, device);
      if (expired) {
        return NextResponse.json({
          status: "revoked",
          deviceId: device.id,
          enforcementActive: isDeviceEnforcementActive(settings),
          reason: "expired",
        });
      }
    }

    const { data: full } = await supabase
      .from("trusted_devices")
      .select(
        "id, status, device_name, browser, os, location_approx, last_notified_at, rejected_at, revoked_at"
      )
      .eq("id", device.id)
      .single();

    const row = full as {
      id: string;
      status: string;
      device_name: string;
      browser: string | null;
      os: string | null;
      location_approx: string | null;
      last_notified_at: string | null;
      rejected_at: string | null;
      revoked_at: string | null;
    } | null;

    if (!row) {
      return NextResponse.json({ status: "missing", enforcementActive: true });
    }

    let canNotifyAgainAt: string | null = null;
    if (row.status === "pending" && row.last_notified_at) {
      canNotifyAgainAt = new Date(
        new Date(row.last_notified_at).getTime() + DEVICE_NOTIFY_COOLDOWN_MS
      ).toISOString();
    }

    const notifiedAdmins =
      row.status === "pending" && admin
        ? await getAdminDisplayNames(admin, orgId, user.id)
        : [];

    const res = NextResponse.json({
      status: row.status,
      deviceId: row.id,
      deviceName: row.device_name,
      browser: row.browser,
      os: row.os,
      location: row.location_approx,
      notifiedAdmins,
      canNotifyAgainAt,
      rejected: Boolean(row.rejected_at),
      enforcementActive: isDeviceEnforcementActive(settings),
    });

    if (row.status === "approved") {
      setDeviceOkCookie(res, user.id, row.id);
      if (admin) {
        void admin
          .from("trusted_devices")
          .update({ last_seen_at: new Date().toISOString() } as never)
          .eq("id", row.id);
      }
    }

    return res;
  } catch (err) {
    console.error("[devices/status] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
