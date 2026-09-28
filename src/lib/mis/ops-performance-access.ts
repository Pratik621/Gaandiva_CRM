import { normalizeRoleName } from "@/lib/auth/config";

/** Roles allowed to view MIS Ops Performance reports (UI + API). */
export const MIS_OPS_REPORT_ROLES = [
  "mis",
  "admin",
  "sales_manager",
  "operations_manager",
] as const;

export function canAccessMisOpsReports(
  roleNames: Array<string | null | undefined>
): boolean {
  return roleNames.some((name) =>
    (MIS_OPS_REPORT_ROLES as readonly string[]).includes(normalizeRoleName(name))
  );
}
