import { getAdminClientSafe } from "@/lib/supabase/admin";
import { createNotifications } from "@/lib/notifications";
import { normalizeRoleName } from "@/lib/auth/config";

const SPIKE_WINDOW_MS = 15 * 60 * 1000;
const SPIKE_THRESHOLD = 10;

export type NetworkAuthEventType =
  | "ip_blocked"
  | "network_override_enabled"
  | "network_override_disabled"
  | "office_network_added"
  | "office_network_removed"
  | "network_restriction_enabled"
  | "network_restriction_disabled";

/** Insert a network auth_event via the service role; never throws. */
export async function logNetworkEvent(args: {
  organizationId: string;
  userId: string | null;
  eventType: NetworkAuthEventType;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const admin = getAdminClientSafe();
  if (!admin) return;

  const { error } = await admin.from("auth_events").insert({
    organization_id: args.organizationId,
    user_id: args.userId,
    event_type: args.eventType,
    channel: null,
    ip: args.ip ?? null,
    user_agent: args.userAgent ?? null,
    metadata: (args.metadata ?? null) as never,
  } as never);
  if (error) {
    console.error("[network] auth_events insert failed:", error.message);
  }

  if (args.eventType === "ip_blocked") {
    await maybeAlertAdminsOnSpike(args.organizationId).catch((err) => {
      console.error("[network] spike alert failed:", err);
    });
  }
}

/**
 * >10 ip_blocked events within 15 minutes → notify org admins once per
 * window (an `ip_block_alert_sent` marker event dedupes repeat alerts).
 */
async function maybeAlertAdminsOnSpike(orgId: string): Promise<void> {
  const admin = getAdminClientSafe();
  if (!admin) return;

  const windowStart = new Date(Date.now() - SPIKE_WINDOW_MS).toISOString();

  const [{ count: blockedCount }, { count: alertCount }] = await Promise.all([
    admin
      .from("auth_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("event_type", "ip_blocked")
      .gte("created_at", windowStart),
    admin
      .from("auth_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("event_type", "ip_block_alert_sent")
      .gte("created_at", windowStart),
  ]);

  if ((blockedCount ?? 0) <= SPIKE_THRESHOLD || (alertCount ?? 0) > 0) return;

  // Marker first so concurrent blocks don't double-alert.
  await admin.from("auth_events").insert({
    organization_id: orgId,
    user_id: null,
    event_type: "ip_block_alert_sent",
    metadata: { blocked_count: blockedCount } as never,
  } as never);

  // Notify all org admins through the existing bell.
  const { data: orgRoles } = await admin
    .from("roles")
    .select("id, name")
    .eq("organization_id", orgId);
  const adminRoleIds = ((orgRoles ?? []) as { id: string; name: string }[])
    .filter((r) => normalizeRoleName(r.name) === "admin")
    .map((r) => r.id);
  if (adminRoleIds.length === 0) return;

  const { data: adminRows } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role_id", adminRoleIds);
  const adminIds = [
    ...new Set(((adminRows ?? []) as { user_id: string }[]).map((r) => r.user_id)),
  ];
  if (adminIds.length === 0) return;

  await createNotifications(
    adminIds.map((receiverId) => ({
      title: "Network security alert",
      message: `${blockedCount} agent logins were blocked by the office-network restriction in the last 15 minutes. This could be an attack or the office IP may have changed.`,
      type: "system" as const,
      sender_id: adminIds[0],
      receiver_id: receiverId,
      organization_id: orgId,
    }))
  );
}
