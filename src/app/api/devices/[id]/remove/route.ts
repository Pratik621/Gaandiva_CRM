import { NextResponse, type NextRequest } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { getDeviceApiUser } from "@/lib/devices/api-auth";
import {
  readDeviceTokenFromRequest,
  lookupDeviceByToken,
  clearAllDeviceCookies,
  logDeviceEvent,
  getRequestMeta,
} from "@/lib/devices";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getDeviceApiUser();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { supabase, user, orgId } = ctx as Exclude<
      Awaited<ReturnType<typeof getDeviceApiUser>>,
      { error: NextResponse }
    >;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: device } = await admin
      .from("trusted_devices")
      .select("id, user_id, organization_id, status, device_name")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    const row = device as {
      id: string;
      user_id: string;
      organization_id: string;
      status: string;
      device_name: string;
    } | null;

    if (!row || row.organization_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (row.status === "revoked") {
      return NextResponse.json({ ok: true, alreadyRevoked: true });
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("trusted_devices")
      .update({
        status: "revoked",
        revoked_at: now,
        revoked_by: user.id,
      } as never)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { ip, userAgent } = getRequestMeta(request);
    await logDeviceEvent(admin, {
      organizationId: orgId,
      userId: user.id,
      eventType: "device_revoked",
      ip,
      userAgent,
      metadata: { device_id: id, self_remove: true, acting_admin_id: user.id },
    });

    let isCurrent = false;
    const token = readDeviceTokenFromRequest(request);
    if (token) {
      const current = await lookupDeviceByToken(supabase, user.id, token);
      isCurrent = current?.id === id;
    }

    const res = NextResponse.json({ ok: true, isCurrent });
    if (isCurrent) {
      clearAllDeviceCookies(res);
    }
    return res;
  } catch (err) {
    console.error("[devices/remove] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
