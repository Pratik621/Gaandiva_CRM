import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { MAX_APPROVED_DEVICES } from "@/lib/devices/constants";

type AnyClient = SupabaseClient<Database>;

export async function countApprovedDevices(
  client: AnyClient,
  userId: string
): Promise<number> {
  const { count } = await client
    .from("trusted_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "approved");

  return count ?? 0;
}

export async function listApprovedDevices(
  client: AnyClient,
  userId: string
): Promise<
  Array<{
    id: string;
    device_name: string;
    browser: string | null;
    os: string | null;
    location_approx: string | null;
    last_seen_at: string | null;
    created_at: string;
  }>
> {
  const { data } = await client
    .from("trusted_devices")
    .select("id, device_name, browser, os, location_approx, last_seen_at, created_at")
    .eq("user_id", userId)
    .eq("status", "approved")
    .order("last_seen_at", { ascending: false });

  return (data ?? []) as Array<{
    id: string;
    device_name: string;
    browser: string | null;
    os: string | null;
    location_approx: string | null;
    last_seen_at: string | null;
    created_at: string;
  }>;
}

export function isAtDeviceLimit(approvedCount: number): boolean {
  return approvedCount >= MAX_APPROVED_DEVICES;
}
