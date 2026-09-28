import { normalizeRoleName } from "@/lib/auth/config";

/** Roles allowed to view MIS Ops Performance reports (UI + API). */
export const QATL_OPS_REPORT_ROLES = [
  "qa_tl",
  "admin",
  "sales_manager",
  "operations_manager",
] as const;

export function canAccessQatlOpsReports(
  roleNames: Array<string | null | undefined>
): boolean {
  return roleNames.some((name) =>
    (QATL_OPS_REPORT_ROLES as readonly string[]).includes(normalizeRoleName(name))
  );
}
