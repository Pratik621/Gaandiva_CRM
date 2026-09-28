import { NextResponse } from "next/server";
import { verifyOrgAdmin } from "@/lib/devices/api-auth";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { invalidateNetworkConfigCache } from "@/lib/network/settings";
import { logNetworkEvent } from "@/lib/network/audit";
import { getRequestMeta } from "@/lib/mfa/audit";

export const dynamic = "force-dynamic";

const OVERRIDE_HOURS = [4, 8, 24];

/** Policy + allowlist + 24h blocked count for the admin Network Access card. */
export async function GET() {
  try {
    const ctx = await verifyOrgAdmin();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { orgId } = ctx as { orgId: string };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: policy }, { data: networks }, blockedRes] = await Promise.all([
      admin
        .from("org_network_policy")
        .select("agent_ip_restriction_enabled, monitor_only, emergency_override_until, updated_at")
        .eq("organization_id", orgId)
        .maybeSingle(),
      admin
        .from("office_networks")
        .select("id, label, cidr, is_active, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true }),
      admin
        .from("auth_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("event_type", "ip_blocked")
        .gte("created_at", dayAgo),
    ]);

    return NextResponse.json({
      policy:
        policy ?? {
          agent_ip_restriction_enabled: false,
          monitor_only: true,
          emergency_override_until: null,
          updated_at: null,
        },
      networks: networks ?? [],
      blocked_24h: blockedRes.count ?? 0,
    });
  } catch (err) {
    console.error("Network settings GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Update policy: toggle enforcement / monitor-only, start or stop the
 * emergency override. Every change is audited.
 */
export async function PATCH(request: Request) {
  try {
    const ctx = await verifyOrgAdmin();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { orgId, user } = ctx as { orgId: string; user: { id: string } };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as {
      agent_ip_restriction_enabled?: boolean;
      monitor_only?: boolean;
      override_hours?: number | null; // number = start, null = stop
    } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("org_network_policy")
      .select("agent_ip_restriction_enabled, monitor_only, emergency_override_until")
      .eq("organization_id", orgId)
      .maybeSingle();
    const current = existing as {
      agent_ip_restriction_enabled: boolean;
      monitor_only: boolean;
      emergency_override_until: string | null;
    } | null;

    const updates: Record<string, unknown> = {
      organization_id: orgId,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
    const { ip, userAgent } = getRequestMeta(request);
    const audits: Promise<void>[] = [];

    if (typeof body.agent_ip_restriction_enabled === "boolean") {
      updates.agent_ip_restriction_enabled = body.agent_ip_restriction_enabled;
      if (body.agent_ip_restriction_enabled !== current?.agent_ip_restriction_enabled) {
        audits.push(
          logNetworkEvent({
            organizationId: orgId,
            userId: user.id,
            eventType: body.agent_ip_restriction_enabled
              ? "network_restriction_enabled"
              : "network_restriction_disabled",
            ip,
            userAgent,
          })
        );
      }
    }

    if (typeof body.monitor_only === "boolean") {
      updates.monitor_only = body.monitor_only;
    }

    if (body.override_hours !== undefined) {
      if (body.override_hours === null) {
        updates.emergency_override_until = null;
        audits.push(
          logNetworkEvent({
            organizationId: orgId,
            userId: user.id,
            eventType: "network_override_disabled",
            ip,
            userAgent,
          })
        );
      } else {
        if (!OVERRIDE_HOURS.includes(body.override_hours)) {
          return NextResponse.json(
            { error: `override_hours must be one of ${OVERRIDE_HOURS.join(", ")}` },
            { status: 400 }
          );
        }
        const until = new Date(Date.now() + body.override_hours * 60 * 60 * 1000).toISOString();
        updates.emergency_override_until = until;
        audits.push(
          logNetworkEvent({
            organizationId: orgId,
            userId: user.id,
            eventType: "network_override_enabled",
            ip,
            userAgent,
            metadata: { hours: body.override_hours, until },
          })
        );
      }
    }

    const { error } = await admin
      .from("org_network_policy")
      .upsert(updates as never, { onConflict: "organization_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    invalidateNetworkConfigCache(orgId);
    await Promise.all(audits);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Network settings PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
