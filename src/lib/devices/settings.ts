import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type AnyClient = SupabaseClient<Database>;

export type OrgDeviceSettings = {
  organizationId: string;
  enabled: boolean;
  graceEndsAt: string | null;
};

export async function getOrgDeviceSettings(
  client: AnyClient,
  organizationId: string
): Promise<OrgDeviceSettings> {
  const { data } = await client
    .from("org_device_settings")
    .select("organization_id, enabled, grace_ends_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const row = data as {
    organization_id: string;
    enabled: boolean;
    grace_ends_at: string | null;
  } | null;

  return {
    organizationId,
    enabled: row?.enabled ?? false,
    graceEndsAt: row?.grace_ends_at ?? null,
  };
}

export function isDeviceGracePeriodActive(settings: OrgDeviceSettings): boolean {
  if (!settings.enabled) return false;
  if (!settings.graceEndsAt) return false;
  return Date.now() < new Date(settings.graceEndsAt).getTime();
}

export function isDeviceEnforcementActive(settings: OrgDeviceSettings): boolean {
  if (!settings.enabled) return false;
  return !isDeviceGracePeriodActive(settings);
}

export function deviceGraceDaysRemaining(settings: OrgDeviceSettings): number | null {
  if (!settings.enabled || !settings.graceEndsAt) return null;
  const ms = new Date(settings.graceEndsAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
