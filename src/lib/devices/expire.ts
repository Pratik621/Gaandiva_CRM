import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logAuthEvent } from "@/lib/mfa/audit";
import { DEVICE_IDLE_EXPIRY_DAYS } from "@/lib/devices/constants";

type AdminClient = SupabaseClient<Database>;

export async function expireStaleDevices(admin: AdminClient): Promise<number> {
  const cutoff = new Date(
    Date.now() - DEVICE_IDLE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const now = new Date().toISOString();

  const { data: stale, error } = await admin
    .from("trusted_devices")
    .select("id, organization_id, user_id")
    .eq("status", "approved")
    .lt("last_seen_at", cutoff)
    .limit(500);

  if (error) {
    console.error("[devices] expire query failed:", error.message);
    return 0;
  }

  const rows = (stale ?? []) as Array<{
    id: string;
    organization_id: string;
    user_id: string;
  }>;

  if (rows.length === 0) return 0;

  const ids = rows.map((r) => r.id);
  const { error: updateError } = await admin
    .from("trusted_devices")
    .update({
      status: "revoked",
      revoked_at: now,
      revoked_by: null,
    } as never)
    .in("id", ids)
    .eq("status", "approved");

  if (updateError) {
    console.error("[devices] expire update failed:", updateError.message);
    return 0;
  }

  for (const row of rows) {
    await logAuthEvent(admin, {
      organizationId: row.organization_id,
      userId: row.user_id,
      eventType: "device_expired",
      metadata: { device_id: row.id, idle_days: DEVICE_IDLE_EXPIRY_DAYS },
    });
  }

  return rows.length;
}

/** Lazy single-device expiry check (backup for cron). */
export async function maybeExpireDeviceIfStale(
  admin: AdminClient,
  device: {
    id: string;
    organization_id: string;
    user_id: string;
    status: string;
    last_seen_at: string | null;
  }
): Promise<boolean> {
  if (device.status !== "approved" || !device.last_seen_at) return false;
  const cutoff = Date.now() - DEVICE_IDLE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  if (new Date(device.last_seen_at).getTime() >= cutoff) return false;

  const now = new Date().toISOString();
  const { error } = await admin
    .from("trusted_devices")
    .update({
      status: "revoked",
      revoked_at: now,
      revoked_by: null,
    } as never)
    .eq("id", device.id)
    .eq("status", "approved");

  if (error) return false;

  await logAuthEvent(admin, {
    organizationId: device.organization_id,
    userId: device.user_id,
    eventType: "device_expired",
    metadata: { device_id: device.id, idle_days: DEVICE_IDLE_EXPIRY_DAYS },
  });

  return true;
}
