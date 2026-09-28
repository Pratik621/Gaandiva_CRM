import type { AdminClient } from "@/lib/supabase/admin";
import { normalizeRoleName } from "@/lib/auth/config";
import {
  ANNOUNCEMENT_TYPES,
  type AnnouncementType,
  type PermissionRule,
  type PermissionScope,
} from "@/lib/announcements/types";

type MatrixRow = {
  organization_id: string | null;
  sender_role: string;
  target_role: string;
  allowed_types: string[];
  scope: string;
};

function toRule(row: MatrixRow): PermissionRule {
  return {
    sender_role: normalizeRoleName(row.sender_role),
    target_role: normalizeRoleName(row.target_role),
    allowed_types: (row.allowed_types ?? []).filter((t): t is AnnouncementType =>
      (ANNOUNCEMENT_TYPES as readonly string[]).includes(t)
    ),
    scope: (["org", "team", "audited_agents"].includes(row.scope)
      ? row.scope
      : "org") as PermissionScope,
  };
}

/**
 * Matrix rules applicable to a sender. Org-specific rows override the global
 * defaults per sender_role; rules are unioned across the caller's roles.
 */
export async function fetchPermissionRulesForSender(
  admin: AdminClient,
  orgId: string,
  senderRoles: string[]
): Promise<PermissionRule[]> {
  const normalized = [...new Set(senderRoles.map((r) => normalizeRoleName(r)).filter(Boolean))];
  if (normalized.length === 0) return [];

  const { data, error } = await admin
    .from("announcement_role_permissions")
    .select("organization_id, sender_role, target_role, allowed_types, scope")
    .or(`organization_id.is.null,organization_id.eq.${orgId}`)
    .in("sender_role", normalized);

  if (error) {
    console.error("[announcements] permission matrix fetch failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as MatrixRow[];
  // Per sender_role: if the org defined ANY rows, they replace that role's
  // global defaults entirely.
  const sendersWithOrgRows = new Set(
    rows.filter((r) => r.organization_id !== null).map((r) => normalizeRoleName(r.sender_role))
  );
  const effective = rows.filter((r) => {
    const sender = normalizeRoleName(r.sender_role);
    return sendersWithOrgRows.has(sender) ? r.organization_id !== null : r.organization_id === null;
  });

  // Union across the caller's roles: widest grant wins per target_role.
  const byTarget = new Map<string, PermissionRule>();
  for (const row of effective.map(toRule)) {
    const existing = byTarget.get(row.target_role);
    if (!existing) {
      byTarget.set(row.target_role, row);
      continue;
    }
    const mergedTypes = [...new Set([...existing.allowed_types, ...row.allowed_types])];
    // 'org' is the widest scope; keep it when any of the caller's roles grants it.
    const mergedScope: PermissionScope =
      existing.scope === "org" || row.scope === "org"
        ? "org"
        : existing.scope === "team" || row.scope === "team"
        ? "team"
        : "audited_agents";
    byTarget.set(row.target_role, {
      ...existing,
      allowed_types: mergedTypes as AnnouncementType[],
      scope: mergedScope,
    });
  }

  return [...byTarget.values()];
}

/** Find the rule permitting this send, or null (caller returns 403). */
export function findSendRule(
  rules: PermissionRule[],
  params: { type: AnnouncementType; targetRole: string }
): PermissionRule | null {
  const target = normalizeRoleName(params.targetRole);
  const rule = rules.find((r) => r.target_role === target);
  if (!rule) return null;
  return rule.allowed_types.includes(params.type) ? rule : null;
}
