import { NextResponse, type NextRequest } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { verifyOrgAdmin } from "@/lib/devices/api-auth";
import {
  countApprovedDevices,
  listApprovedDevices,
  isAtDeviceLimit,
  MAX_APPROVED_DEVICES,
  notifyUserOfDeviceDecision,
  logDeviceEvent,
  getRequestMeta,
} from "@/lib/devices";

export const dynamic = "force-dynamic";

async function loadOrgDevice(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  id: string,
  orgId: string
) {
  const { data } = await admin
    .from("trusted_devices")
    .select("id, user_id, organization_id, status, device_name")
    .eq("id", id)
    .maybeSingle();

  const row = data as {
    id: string;
    user_id: string;
    organization_id: string;
    status: string;
    device_name: string;
  } | null;

  if (!row || row.organization_id !== orgId) return null;
  return row;
}

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

    const device = await loadOrgDevice(admin, id, orgId);
    if (!device) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (device.status === "approved") {
      return NextResponse.json({ ok: true, alreadyApproved: true });
    }

    const approvedCount = await countApprovedDevices(admin, device.user_id);
    if (isAtDeviceLimit(approvedCount) && device.status === "pending") {
      const existing = await listApprovedDevices(admin, device.user_id);
      return NextResponse.json(
        {
          error: `User already has ${MAX_APPROVED_DEVICES} approved devices`,
          code: "DEVICE_LIMIT",
          max: MAX_APPROVED_DEVICES,
          existingDevices: existing,
        },
        { status: 409 }
      );
    }

    // Rejected/revoked pending re-approval from pending only
    if (device.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending devices can be approved" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("trusted_devices")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: now,
        last_seen_at: now,
        rejected_at: null,
        revoked_at: null,
        revoked_by: null,
      } as never)
      .eq("id", id)
      .eq("status", "pending");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { ip, userAgent } = getRequestMeta(request);
    await logDeviceEvent(admin, {
      organizationId: orgId,
      userId: device.user_id,
      eventType: "device_approved",
      ip,
      userAgent,
      metadata: { device_id: id, acting_admin_id: user.id },
    });

    await notifyUserOfDeviceDecision({
      organizationId: orgId,
      userId: device.user_id,
      adminId: user.id,
      deviceId: id,
      approved: true,
      deviceLabel: device.device_name,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/devices/approve] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
