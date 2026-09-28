import { normalizeRoleName } from "@/lib/auth/config";
import { EMAIL_MARKETING_MANAGER_ROLE } from "@/lib/auth/emm-access";

/** Roles that can use QA-style campaign list/detail (Scored-lead metrics). */
export function canAccessQaCampaignApis(
  roleNames: Array<string | null | undefined>
): boolean {
  return roleNames.some((name) => {
    const n = normalizeRoleName(name);
    return n === "qa" || n === "admin" || n === EMAIL_MARKETING_MANAGER_ROLE;
  });
}
