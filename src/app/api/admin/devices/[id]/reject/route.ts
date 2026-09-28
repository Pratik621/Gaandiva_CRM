import { NextResponse, type NextRequest } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { verifyOrgAdmin } from "@/lib/devices/api-auth";
import {
  notifyUserOfDeviceDecision,
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
    const auth = await verifyOrgAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, user } = auth as Exclude<
      Awaited<ReturnType<typeof verifyOrgAdmin>>,
      { error: NextResponse }
    >;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data } = await admin
      .from("trusted_devices")
      .select("id, user_id, organization_id, status, device_name")
      .eq("id", id)
      .maybeSingle();

    const device = data as {
      id: string;
      user_id: string;
      organization_id: string;
      status: string;
      device_name: string;
    } | null;

    if (!device || device.organization_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (device.status !== "pending") {
      return NextResponse.json({ error: "Only pending devices can be rejected" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("trusted_devices")
      .update({
        status: "revoked",
        rejected_at: now,
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
      userId: device.user_id,
      eventType: "device_rejected",
      ip,
      userAgent,
      metadata: { device_id: id, acting_admin_id: user.id },
    });

    await notifyUserOfDeviceDecision({
      organizationId: orgId,
      userId: device.user_id,
      adminId: user.id,
      deviceId: id,
      approved: false,
      deviceLabel: device.device_name,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/devices/reject] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
