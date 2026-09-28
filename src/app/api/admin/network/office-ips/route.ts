import { NextResponse } from "next/server";
import { verifyOrgAdmin } from "@/lib/devices/api-auth";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { isValidCidr } from "@/lib/network/cidr";
import { invalidateNetworkConfigCache } from "@/lib/network/settings";
import { logNetworkEvent } from "@/lib/network/audit";
import { getRequestMeta } from "@/lib/mfa/audit";

export const dynamic = "force-dynamic";

/** Add an office network (single IP or CIDR range) to the allowlist. */
export async function POST(request: Request) {
  try {
    const ctx = await verifyOrgAdmin();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { orgId, user } = ctx as { orgId: string; user: { id: string } };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as {
      label?: string;
      cidr?: string;
    } | null;
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    let cidr = typeof body?.cidr === "string" ? body.cidr.trim() : "";

    if (!label) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }
    if (!isValidCidr(cidr)) {
      return NextResponse.json(
        { error: "Enter a valid IP (e.g. 203.0.113.7) or CIDR range (e.g. 203.0.113.0/24)" },
        { status: 400 }
      );
    }
    // Normalize bare IPv4 to /32 for display consistency.
    if (!cidr.includes("/") && !cidr.includes(":")) {
      cidr = `${cidr}/32`;
    }

    const { data: inserted, error } = await admin
      .from("office_networks")
      .insert({
        organization_id: orgId,
        label,
        cidr,
        is_active: true,
        created_by: user.id,
      } as never)
      .select("id, label, cidr, is_active, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    invalidateNetworkConfigCache(orgId);
    const { ip, userAgent } = getRequestMeta(request);
    await logNetworkEvent({
      organizationId: orgId,
      userId: user.id,
      eventType: "office_network_added",
      ip,
      userAgent,
      metadata: { label, cidr },
    });

    return NextResponse.json({ network: inserted }, { status: 201 });
  } catch (err) {
    console.error("Office IP add error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
