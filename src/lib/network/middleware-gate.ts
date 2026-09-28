import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractClientIp,
  fetchOrgNetworkConfig,
  isOverrideActive,
  isPureAgent,
} from "@/lib/network/settings";
import { ipMatchesAnyCidr } from "@/lib/network/cidr";
import { logNetworkEvent } from "@/lib/network/audit";

export const NETWORK_BLOCKED_PATH = "/network-blocked";

export type NetworkGateResult = {
  /** True when the request must be blocked (redirect page / 403 API). */
  blocked: boolean;
  /** True when a would-be block was logged in monitor-only mode. */
  monitorOnly: boolean;
};

const PASS: NetworkGateResult = { blocked: false, monitorOnly: false };

/**
 * Office-network gate for pure-agent accounts. Evaluated on every
 * authenticated agent request (pages + /api/agent) so a live session dies
 * the moment the agent leaves the office network. Config is cached 60s.
 *
 * Fails OPEN on internal errors — a broken allowlist lookup must never lock
 * the whole workforce out; enforcement resumes on the next healthy request.
 */
export async function evaluateNetworkGate(
  request: NextRequest,
  supabase: SupabaseClient,
  userId: string,
  normalizedRoles: string[],
  orgId: string | null
): Promise<NetworkGateResult> {
  try {

    if (
       process.env.NODE_ENV !== "production" &&
       ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
         request.nextUrl.hostname
       )
     ) {
       return PASS;
     }

    if (!isPureAgent(normalizedRoles)) return PASS;
    if (!orgId) return PASS;

    const { policy, activeCidrs } = await fetchOrgNetworkConfig(supabase, orgId);
    if (!policy.agent_ip_restriction_enabled) return PASS;
    if (isOverrideActive(policy)) return PASS;
    // No allowlist configured = would block everyone; treat as misconfig.
    if (activeCidrs.length === 0) return PASS;

    const ip = extractClientIp(request);
    if (ipMatchesAnyCidr(ip, activeCidrs)) return PASS;

    // Denied IP — audit it (monitor_only flag included for rollout analysis).
    void logNetworkEvent({
      organizationId: orgId,
      userId,
      eventType: "ip_blocked",
      ip,
      userAgent: request.headers.get("user-agent"),
      metadata: {
        path: request.nextUrl.pathname,
        monitor_only: policy.monitor_only,
      },
    });

    if (policy.monitor_only) {
      return { blocked: false, monitorOnly: true };
    }
    return { blocked: true, monitorOnly: false };
  } catch (err) {
    console.warn("[middleware] network gate failed (failing open):", err);
    return PASS;
  }
}
