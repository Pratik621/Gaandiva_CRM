import type { SupabaseClient } from "@supabase/supabase-js";

export type OrgNetworkPolicy = {
  agent_ip_restriction_enabled: boolean;
  monitor_only: boolean;
  emergency_override_until: string | null;
};

export type OrgNetworkConfig = {
  policy: OrgNetworkPolicy;
  activeCidrs: string[];
};

const DEFAULT_POLICY: OrgNetworkPolicy = {
  agent_ip_restriction_enabled: false,
  monitor_only: true,
  emergency_override_until: null,
};

/** 60s in-memory cache (per edge isolate) — no DB hit on most requests. */
const CACHE_TTL_MS = 60_000;
const configCache = new Map<string, { config: OrgNetworkConfig; expires: number }>();

export function invalidateNetworkConfigCache(orgId: string) {
  configCache.delete(orgId);
}

export async function fetchOrgNetworkConfig(
  client: SupabaseClient,
  orgId: string
): Promise<OrgNetworkConfig> {
  const cached = configCache.get(orgId);
  if (cached && cached.expires > Date.now()) {
    return cached.config;
  }

  const [{ data: policyRow }, { data: networkRows }] = await Promise.all([
    client
      .from("org_network_policy")
      .select("agent_ip_restriction_enabled, monitor_only, emergency_override_until")
      .eq("organization_id", orgId)
      .maybeSingle(),
    client
      .from("office_networks")
      .select("cidr")
      .eq("organization_id", orgId)
      .eq("is_active", true),
  ]);

  const policy = (policyRow as OrgNetworkPolicy | null) ?? DEFAULT_POLICY;
  const activeCidrs = ((networkRows ?? []) as { cidr: string }[])
    .map((r) => r.cidr)
    .filter(Boolean);

  const config: OrgNetworkConfig = { policy, activeCidrs };
  configCache.set(orgId, { config, expires: Date.now() + CACHE_TTL_MS });
  return config;
}

export function isOverrideActive(policy: OrgNetworkPolicy): boolean {
  return Boolean(
    policy.emergency_override_until &&
      new Date(policy.emergency_override_until).getTime() > Date.now()
  );
}

/** Pure-agent = has agent role and no other role (multi-role users pass). */
export function isPureAgent(normalizedRoles: string[]): boolean {
  const distinct = [...new Set(normalizedRoles.filter(Boolean))];
  return distinct.length === 1 && distinct[0] === "agent";
}

export function extractClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}
