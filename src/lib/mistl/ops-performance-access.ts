import { normalizeRoleName } from "@/lib/auth/config";

/** Roles allowed to view MIS TL Ops Performance reports (UI + API). */
export const MISTL_OPS_REPORT_ROLES = [
  "mis",
  "mis_tl",
  "admin",
  "sales_manager",
  "operations_manager",
] as const;


export function canAccessMistlOpsReports(
  roleNames: Array<string | null | undefined>
): boolean {
  return roleNames.some((name) =>
    (MISTL_OPS_REPORT_ROLES as readonly string[]).includes(normalizeRoleName(name))
  );
}
