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

    const body = (await request.json()) as { revokeDeviceId?: string };
    const revokeDeviceId = body.revokeDeviceId?.trim();
    if (!revokeDeviceId) {
      return NextResponse.json({ error: "revokeDeviceId required" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: pendingData } = await admin
      .from("trusted_devices")
      .select("id, user_id, organization_id, status, device_name")
      .eq("id", id)
      .maybeSingle();

    const pending = pendingData as {
      id: string;
      user_id: string;
      organization_id: string;
      status: string;
      device_name: string;
    } | null;

    if (!pending || pending.organization_id !== orgId || pending.status !== "pending") {
      return NextResponse.json({ error: "Pending device not found" }, { status: 404 });
    }

    const { data: oldData } = await admin
      .from("trusted_devices")
      .select("id, user_id, organization_id, status, device_name")
      .eq("id", revokeDeviceId)
      .maybeSingle();

    const old = oldData as {
      id: string;
      user_id: string;
      organization_id: string;
      status: string;
      device_name: string;
    } | null;

    if (
      !old ||
      old.organization_id !== orgId ||
      old.user_id !== pending.user_id ||
      old.status !== "approved"
    ) {
      return NextResponse.json({ error: "Approved device to revoke not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { ip, userAgent } = getRequestMeta(request);

    const { error: revokeErr } = await admin
      .from("trusted_devices")
      .update({
        status: "revoked",
        revoked_at: now,
        revoked_by: user.id,
      } as never)
      .eq("id", revokeDeviceId)
      .eq("status", "approved");

    if (revokeErr) {
      return NextResponse.json({ error: revokeErr.message }, { status: 500 });
    }

    await logDeviceEvent(admin, {
      organizationId: orgId,
      userId: old.user_id,
      eventType: "device_revoked",
      ip,
      userAgent,
      metadata: {
        device_id: revokeDeviceId,
        acting_admin_id: user.id,
        revoke_and_approve: true,
        approve_device_id: id,
      },
    });

    const { error: approveErr } = await admin
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

    if (approveErr) {
      return NextResponse.json({ error: approveErr.message }, { status: 500 });
    }

    await logDeviceEvent(admin, {
      organizationId: orgId,
      userId: pending.user_id,
      eventType: "device_approved",
      ip,
      userAgent,
      metadata: {
        device_id: id,
        acting_admin_id: user.id,
        revoke_and_approve: true,
        revoked_device_id: revokeDeviceId,
      },
    });

    await notifyUserOfDeviceDecision({
      organizationId: orgId,
      userId: pending.user_id,
      adminId: user.id,
      deviceId: id,
      approved: true,
      deviceLabel: pending.device_name,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/devices/revoke-and-approve] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
