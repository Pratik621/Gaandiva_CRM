import { NextResponse, type NextRequest } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { getDeviceApiUser } from "@/lib/devices/api-auth";
import {
  generateDeviceToken,
  hashDeviceToken,
  setDeviceTokenCookie,
  setDeviceOkCookie,
  readDeviceTokenFromRequest,
  lookupDeviceByToken,
  getOrgDeviceSettings,
  isDeviceGracePeriodActive,
  isDeviceEnforcementActive,
  shouldBootstrapAutoApprove,
  parseUserAgent,
  approximateLocationFromHeaders,
  notifyAdminsOfDeviceRequest,
  getAdminDisplayNames,
  logDeviceEvent,
  getRequestMeta,
} from "@/lib/devices";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getDeviceApiUser();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { supabase, user, orgId, primaryRole, isAdmin, fullName } = ctx as Exclude<
      Awaited<ReturnType<typeof getDeviceApiUser>>,
      { error: NextResponse }
    >;

    const settings = await getOrgDeviceSettings(supabase, orgId);
    if (!settings.enabled) {
      return NextResponse.json({ status: "skipped", reason: "disabled" });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const existingToken = readDeviceTokenFromRequest(request);
    if (existingToken) {
      const existing = await lookupDeviceByToken(supabase, user.id, existingToken);
      if (existing && existing.status !== "revoked") {
        const res = NextResponse.json({
          status: existing.status,
          deviceId: existing.id,
          existing: true,
        });
        if (existing.status === "approved") {
          setDeviceOkCookie(res, user.id, existing.id);
        }
        return res;
      }
    }

    const { ip, userAgent } = getRequestMeta(request);
    const ua = parseUserAgent(userAgent);
    const location = approximateLocationFromHeaders(request.headers);
    const token = generateDeviceToken();
    const tokenHash = hashDeviceToken(token);
    const now = new Date().toISOString();

    const inGrace = isDeviceGracePeriodActive(settings);
    const bootstrap = await shouldBootstrapAutoApprove(admin, {
      organizationId: orgId,
      userId: user.id,
      isAdmin,
    });

    const autoApprove = inGrace || bootstrap;
    const status = autoApprove ? "approved" : "pending";

    const { data: inserted, error } = await admin
      .from("trusted_devices")
      .insert({
        organization_id: orgId,
        user_id: user.id,
        token_hash: tokenHash,
        device_name: ua.deviceName,
        browser: ua.browser,
        os: ua.os,
        ip_at_registration: ip,
        location_approx: location,
        status,
        approved_by: bootstrap ? user.id : null,
        approved_at: autoApprove ? now : null,
        last_seen_at: autoApprove ? now : null,
        last_notified_at: !autoApprove || inGrace ? (autoApprove && inGrace ? null : now) : null,
        created_at: now,
      } as never)
      .select("id, status, device_name, browser, os, location_approx")
      .single();

    if (error || !inserted) {
      console.error("[devices/register] insert failed:", error?.message);
      return NextResponse.json({ error: "Failed to register device" }, { status: 500 });
    }

    const device = inserted as {
      id: string;
      status: string;
      device_name: string;
      browser: string | null;
      os: string | null;
      location_approx: string | null;
    };

    await logDeviceEvent(admin, {
      organizationId: orgId,
      userId: user.id,
      eventType: "device_registered",
      ip,
      userAgent,
      metadata: {
        device_id: device.id,
        status: device.status,
        bootstrap,
        grace: inGrace,
      },
    });

    if (bootstrap) {
      await logDeviceEvent(admin, {
        organizationId: orgId,
        userId: user.id,
        eventType: "device_approved",
        ip,
        userAgent,
        metadata: { device_id: device.id, bootstrap: true, acting_admin_id: user.id },
      });
    }

    let notifiedAdmins: string[] = [];
    if (status === "pending") {
      notifiedAdmins = await notifyAdminsOfDeviceRequest(admin, {
        organizationId: orgId,
        requesterId: user.id,
        requesterName: fullName,
        requesterRole: primaryRole,
        deviceId: device.id,
        deviceLabel: device.device_name,
      });
      await admin
        .from("trusted_devices")
        .update({ last_notified_at: now } as never)
        .eq("id", device.id);
    } else if (inGrace) {
      // Silent inventory during grace — no admin notify
      notifiedAdmins = [];
    }

    const res = NextResponse.json({
      status: device.status,
      deviceId: device.id,
      deviceName: device.device_name,
      browser: device.browser,
      os: device.os,
      location: device.location_approx,
      notifiedAdmins:
        status === "pending"
          ? notifiedAdmins.length
            ? notifiedAdmins
            : await getAdminDisplayNames(admin, orgId, user.id)
          : [],
      enforcementActive: isDeviceEnforcementActive(settings),
      bootstrap,
      grace: inGrace,
    });

    setDeviceTokenCookie(res, token);
    if (device.status === "approved") {
      setDeviceOkCookie(res, user.id, device.id);
    }

    return res;
  } catch (err) {
    console.error("[devices/register] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
