import { normalizeRoleName } from "@/lib/auth/config";

/** Roles that use the /tl area (dashboard, campaigns, leads) — same UX as Team Leader. */
export const TL_ACCESS_ROLES = ["team_leader", "tl", "operations_manager"] as const;

export type TLAccessRole = (typeof TL_ACCESS_ROLES)[number];

/** Whether a role name grants TL-area access (handles "Operations Manager", team_leader variants). */
export function isTLAccessRole(roleName: string | null | undefined): boolean {
  const n = normalizeRoleName(roleName);
  if ((TL_ACCESS_ROLES as readonly string[]).includes(n)) return true;
  if (!roleName) return false;
  const raw = roleName.toLowerCase().trim().replace(/\s+/g, "_");
  return (
    raw === "teamleader" ||
    (raw.includes("team") && raw.includes("leader"))
  );
}

export function hasTLAccess(roleNames: Array<string | null | undefined>): boolean {
  return roleNames.some((name) => isTLAccessRole(name));
}

export function isOperationsManagerRole(roleName: string | null | undefined): boolean {
  return normalizeRoleName(roleName) === "operations_manager";
}

export function hasOperationsManagerAccess(
  roleNames: Array<string | null | undefined>
): boolean {
  return roleNames.some((name) => isOperationsManagerRole(name));
}

/** See all org campaigns (not scoped to assigned_team_leader_id). */
export function hasOrgWideCampaignAccess(
  roleNames: Array<string | null | undefined>
): boolean {
  if (hasOperationsManagerAccess(roleNames)) return true;
  return roleNames.some((name) => {
    const n = normalizeRoleName(name);
    return (
      n === "sales" ||
      n === "sales_manager" ||
      n === "admin" ||
      n === "mis" ||
      n === "email_marketing_manager"
    );
  });
}

export function hasSalesManagerAccess(
  roleNames: Array<string | null | undefined>
): boolean {
  return roleNames.some((name) => normalizeRoleName(name) === "sales_manager");
}

/** Org-wide Performance / Revenue views (OM, Sales Manager, Admin). */
export function hasOrgWideInsightsAccess(
  roleNames: Array<string | null | undefined>
): boolean {
  return (
    hasOperationsManagerAccess(roleNames) ||
    hasSalesManagerAccess(roleNames) ||
    roleNames.some((name) => normalizeRoleName(name) === "admin")
  );
}

/** Assign or reassign team leaders on campaigns (Sales, Sales Manager, Admin, Operations Manager). */
export function canAssignCampaignTeamLeader(
  roleNames: Array<string | null | undefined>
): boolean {
  return hasOrgWideCampaignAccess(roleNames);
}

/** Team Leader / TL only — assignable on campaigns (not Operations Manager). */
export function isCampaignTeamLeaderRole(roleName: string | null | undefined): boolean {
  if (isOperationsManagerRole(roleName)) return false;
  const n = normalizeRoleName(roleName);
  if (n === "team_leader" || n === "tl") return true;
  if (!roleName) return false;
  const raw = roleName.toLowerCase().trim().replace(/\s+/g, "_");
  return (
    raw === "teamleader" ||
    (raw.includes("team") && raw.includes("leader"))
  );
}

/** Role slugs for useRoleGuard on /tl routes. */
export function getTLGuardRoles(): string[] {
  return [...TL_ACCESS_ROLES, "admin"];
}

/** Role slugs for useRoleGuard on /om routes (dashboard only — other OM tools stay on /tl). */
export function getOMGuardRoles(): string[] {
  return ["operations_manager", "admin"];
}

/** Human-readable label for the TL-area header (prefers Operations Manager when assigned). */
export function getTLAreaRoleDisplayName(
  roles: Array<{ role_name?: string; name?: string } | string | null | undefined>
): string {
  const names = roles
    .map((r) => (typeof r === "string" ? r : r?.role_name ?? r?.name ?? ""))
    .filter(Boolean);

  for (const name of names) {
    if (normalizeRoleName(name) === "operations_manager") return "Operations Manager";
  }
  for (const name of names) {
    const n = normalizeRoleName(name);
    if (n === "team_leader" || n === "tl") return "Team Leader";
  }
  return "Team Leader";
}
