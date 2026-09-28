import { NextResponse } from "next/server";
import { verifyOrgAdmin } from "@/lib/devices/api-auth";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { invalidateNetworkConfigCache } from "@/lib/network/settings";
import { logNetworkEvent } from "@/lib/network/audit";
import { getRequestMeta } from "@/lib/mfa/audit";

export const dynamic = "force-dynamic";

/** Activate/deactivate an office network entry (soft toggle, audited). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await verifyOrgAdmin();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { orgId, user } = ctx as { orgId: string; user: { id: string } };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { is_active?: boolean } | null;
    if (!id || typeof body?.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active boolean required" }, { status: 400 });
    }

    const { data: updated, error } = await admin
      .from("office_networks")
      .update({ is_active: body.is_active } as never)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select("id, label, cidr, is_active")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "Network not found" }, { status: 404 });
    }

    invalidateNetworkConfigCache(orgId);
    const row = updated as { label: string; cidr: string };
    const { ip, userAgent } = getRequestMeta(request);
    await logNetworkEvent({
      organizationId: orgId,
      userId: user.id,
      eventType: body.is_active ? "office_network_added" : "office_network_removed",
      ip,
      userAgent,
      metadata: { label: row.label, cidr: row.cidr, toggled: true },
    });

    return NextResponse.json({ network: updated });
  } catch (err) {
    console.error("Office IP toggle error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
