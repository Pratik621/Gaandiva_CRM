import { NextResponse, type NextRequest } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { getDeviceApiUser } from "@/lib/devices/api-auth";
import {
  readDeviceTokenFromRequest,
  lookupDeviceByToken,
  notifyAdminsOfDeviceRequest,
  DEVICE_NOTIFY_COOLDOWN_MS,
} from "@/lib/devices";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getDeviceApiUser();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { supabase, user, orgId, primaryRole, fullName } = ctx as Exclude<
      Awaited<ReturnType<typeof getDeviceApiUser>>,
      { error: NextResponse }
    >;

    const token = readDeviceTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: "No device cookie" }, { status: 400 });
    }

    const device = await lookupDeviceByToken(supabase, user.id, token);
    if (!device || device.status !== "pending") {
      return NextResponse.json({ error: "No pending device" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: full } = await admin
      .from("trusted_devices")
      .select("id, device_name, last_notified_at")
      .eq("id", device.id)
      .single();

    const row = full as {
      id: string;
      device_name: string;
      last_notified_at: string | null;
    } | null;

    if (!row) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    if (row.last_notified_at) {
      const nextAt = new Date(row.last_notified_at).getTime() + DEVICE_NOTIFY_COOLDOWN_MS;
      if (Date.now() < nextAt) {
        return NextResponse.json(
          {
            error: "Please wait before notifying again",
            canNotifyAgainAt: new Date(nextAt).toISOString(),
          },
          { status: 429 }
        );
      }
    }

    const notifiedAdmins = await notifyAdminsOfDeviceRequest(admin, {
      organizationId: orgId,
      requesterId: user.id,
      requesterName: fullName,
      requesterRole: primaryRole,
      deviceId: row.id,
      deviceLabel: row.device_name,
    });

    const now = new Date().toISOString();
    await admin
      .from("trusted_devices")
      .update({ last_notified_at: now } as never)
      .eq("id", row.id);

    return NextResponse.json({
      ok: true,
      notifiedAdmins,
      canNotifyAgainAt: new Date(Date.now() + DEVICE_NOTIFY_COOLDOWN_MS).toISOString(),
    });
  } catch (err) {
    console.error("[devices/notify-again] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
