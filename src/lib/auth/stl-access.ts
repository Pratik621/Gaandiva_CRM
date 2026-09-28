import { normalizeRoleName } from "@/lib/auth/config";
import { hasOperationsManagerAccess, isOperationsManagerRole } from "@/lib/auth/tl-access";

/** Roles that use the /stl area (dashboard, campaigns, leads) — same UX as Senior Team Leader. */
export const STL_ACCESS_ROLES = ["stl", "senior_team_leader", "operations_manager"] as const;

export type STLAccessRole = (typeof STL_ACCESS_ROLES)[number];

/** Whether a role name grants STL-area access (handles "Operations Manager", senior_team_leader variants). */
export function isSTLAccessRole(roleName: string | null | undefined): boolean {
  const n = normalizeRoleName(roleName);
  if ((STL_ACCESS_ROLES as readonly string[]).includes(n)) return true;
  if (!roleName) return false;
  const raw = roleName.toLowerCase().trim().replace(/\s+/g, "_");
  return (
    raw === "seniorteamleader" ||
    (raw.includes("senior") && raw.includes("team") && raw.includes("leader"))
  );
}

export function hasSTLAccess(roleNames: Array<string | null | undefined>): boolean {
  return roleNames.some((name) => isSTLAccessRole(name));
}

/** Senior Team Leader only — assignable as an STL on campaigns (not Operations Manager). */
export function isSeniorTeamLeaderRole(roleName: string | null | undefined): boolean {
  if (isOperationsManagerRole(roleName)) return false;
  const n = normalizeRoleName(roleName);
  if (n === "stl" || n === "senior_team_leader") return true;
  if (!roleName) return false;
  const raw = roleName.toLowerCase().trim().replace(/\s+/g, "_");
  return raw === "seniorteamleader" || (raw.includes("senior") && raw.includes("team") && raw.includes("leader"));
}

/** Assign or reassign STLs on campaigns (Operations Manager, Admin — same gate as TL assignment). */
export function canAssignCampaignSTL(roleNames: Array<string | null | undefined>): boolean {
  return hasOperationsManagerAccess(roleNames) || roleNames.some((n) => normalizeRoleName(n) === "admin");
}

/** Role slugs for useRoleGuard on /stl routes. */
export function getSTLGuardRoles(): string[] {
  return [...STL_ACCESS_ROLES, "admin"];
}

/** Human-readable label for the STL-area header (prefers Operations Manager when assigned). */
export function getSTLAreaRoleDisplayName(
  roles: Array<{ role_name?: string; name?: string } | string | null | undefined>
): string {
  const names = roles
    .map((r) => (typeof r === "string" ? r : r?.role_name ?? r?.name ?? ""))
    .filter(Boolean);

  for (const name of names) {
    if (normalizeRoleName(name) === "operations_manager") return "Operations Manager";
  }
  for (const name of names) {
    if (isSeniorTeamLeaderRole(name)) return "Senior Team Leader";
  }
  return "Senior Team Leader";
}
