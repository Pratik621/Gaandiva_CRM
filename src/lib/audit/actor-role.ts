import { normalizeRoleName } from "@/lib/auth/config";

/** Pick the most relevant role label for admin audit log display. */
const AUDIT_ROLE_PRIORITY = [
  "admin",
  "mis",
  "mis_tl",
  "qa_tl",
  "qa",
  "operations_manager",
  "sales_manager",
  "sales",
  "team_leader",
  "tl",
  "agent",
  "dc",
] as const;

export function resolvePrimaryAuditRole(
  roleNames: Array<string | null | undefined>
): string {
  const normalized = new Set(
    roleNames.map((name) => normalizeRoleName(name)).filter(Boolean)
  );
  for (const role of AUDIT_ROLE_PRIORITY) {
    if (normalized.has(role)) return role;
  }
  return normalized.values().next().value ?? "unknown";
}
