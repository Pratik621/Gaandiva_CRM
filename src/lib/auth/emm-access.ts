import { normalizeRoleName } from "@/lib/auth/config";

/** Normalized role for Email Marketing Manager. */
export const EMAIL_MARKETING_MANAGER_ROLE = "email_marketing_manager";

/** Layout / page guards — Email Marketing Manager + Admin. */
export const EMM_GUARD_ROLES = [EMAIL_MARKETING_MANAGER_ROLE, "admin"] as const;

export function isEmailMarketingManagerRole(
  roleName: string | null | undefined
): boolean {
  return normalizeRoleName(roleName) === EMAIL_MARKETING_MANAGER_ROLE;
}

export function hasEmailMarketingManagerAccess(
  roleNames: Array<string | null | undefined>
): boolean {
  return roleNames.some((name) => isEmailMarketingManagerRole(name));
}

export function canAccessEmmArea(
  roleNames: Array<string | null | undefined>
): boolean {
  return (
    hasEmailMarketingManagerAccess(roleNames) ||
    roleNames.some((name) => normalizeRoleName(name) === "admin")
  );
}
