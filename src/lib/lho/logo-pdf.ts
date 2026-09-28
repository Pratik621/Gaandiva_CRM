import { normalizeRoleName } from "@/lib/auth/config";

const LHO_LOGO_PDF_ROLES = new Set(["client_viewer", "dc"]);

/** Roles that use storage/file LHO download instead of on-the-fly PDF generation. */
const OTHER_BUSINESS_ROLES = new Set([
  "agent",
  "team_leader",
  "tl",
  "operations_manager",
  "admin",
  "qa",
  "mis",
  "sales",
  "sales_manager",
  "internal_operator",
  "internal_admin",
]);

/** client_viewer / dc (without other business roles) get a fresh LHO PDF with org client logo. */
export function shouldGenerateLhoPdfWithLogo(
  roleNames: Iterable<string | null | undefined>
): boolean {
  const normalized = [...roleNames]
    .map((n) => normalizeRoleName(n ?? ""))
    .filter((n) => n.length > 0);
  const hasLogoRole = [...LHO_LOGO_PDF_ROLES].some((r) => normalized.includes(r));
  if (!hasLogoRole) return false;
  return !normalized.some((r) => OTHER_BUSINESS_ROLES.has(r));
}
