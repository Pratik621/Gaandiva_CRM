export const AUTH_STORAGE_KEYS = {
  lastRedirectPath: "gandiv:lastRedirectPath",
  debug: "gandiv:auth-debug",
} as const;

export const PUBLIC_PATHS = [
  "/login",
  "/network-blocked",
  "/auth/forgot-password",
  "/auth/reset-password",
] as const;

/** MFA setup/challenge — authenticated but exempt from MFA gate & role redirects. */
export const MFA_AUTH_PATH_PREFIXES = ["/auth/mfa-setup", "/auth/mfa-challenge"] as const;

/** Device pending/revoked — authenticated but exempt from device gate & role redirects. */
export const DEVICE_AUTH_PATH_PREFIXES = [
  "/auth/device-pending",
  "/auth/device-revoked",
] as const;

export function isMfaAuthPath(pathname: string) {
  return MFA_AUTH_PATH_PREFIXES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function isDeviceAuthPath(pathname: string) {
  return DEVICE_AUTH_PATH_PREFIXES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export const ROLE_ROUTE_ACCESS: Record<string, string[]> = {
  "/admin": ["admin"],
  "/admin-support": ["admin_support"],
  "/agent": ["agent"],
  "/om": ["operations_manager", "admin"],
  "/tl": ["team_leader", "tl", "operations_manager", "admin"],
  "/stl": ["stl", "senior_team_leader", "operations_manager", "admin"],
  "/sales": ["sales", "sales_manager", "admin"],
  "/qa": ["qa", "admin"],
  "/mis": ["mis", "admin"],
  "/mistl": ["mis_tl", "admin"],
  "/qatl": ["qa_tl", "admin"],
  "/dc": ["dc"],
  "/emm": ["email_marketing_manager", "admin"],
  "/marketing": ["sm_marketing", "admin"],
  "/sm-agent": ["sm_agent", "admin"],
};

export const COMMAND_CENTER_ROLES = [
  "client_viewer",
  "internal_operator",
  "internal_admin",
] as const;

export type CommandCenterRole = (typeof COMMAND_CENTER_ROLES)[number];

export const ROLE_DEFAULT_REDIRECT: Record<string, string> = {
  admin: "/admin/dashboard",
  admin_support: "/admin-support/users",
  agent: "/agent/dashboard",
  team_leader: "/tl/dashboard",
  tl: "/tl/dashboard",
  stl: "/stl/dashboard",
  senior_team_leader: "/stl/dashboard",
  operations_manager: "/om/dashboard",
  sales_manager: "/sales/dashboard",
  sales: "/sales",
  qa: "/qa/dashboard",
  mis: "/mis/dashboard",
  mis_tl: "/mistl/dashboard",
  qa_tl: "/qatl/dashboard",
  dc: "/dc/dashboard",
  email_marketing_manager: "/emm/dashboard",
  sm_marketing: "/marketing/dashboard",
  sm_agent: "/sm-agent/dashboard",
  client_viewer: "/dashboard/campaigns",
  internal_operator: "/dashboard/campaigns",
  internal_admin: "/dashboard/campaigns",
};

export function normalizeRoleName(roleName: string | null | undefined) {
  return roleName?.toLowerCase().replace(/\s+/g, "_") ?? "";
}

export function normalizeRoleNames(roleNames: Array<string | null | undefined>) {
  return Array.from(
    new Set(roleNames.map((roleName) => normalizeRoleName(roleName)).filter(Boolean))
  );
}

export function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    isMfaAuthPath(pathname) ||
    isDeviceAuthPath(pathname)
  );
}

export function getRequiredRoles(pathname: string) {
  for (const [prefix, roles] of Object.entries(ROLE_ROUTE_ACCESS)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return roles;
    }
  }

  return null;
}

export function isProtectedPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    getRequiredRoles(pathname) !== null
  );
}

export function getDefaultRedirectPath(roleNames: Array<string | null | undefined>) {
  const normalizedRoles = normalizeRoleNames(roleNames);

  for (const role of normalizedRoles) {
    const redirectPath = ROLE_DEFAULT_REDIRECT[role];
    if (redirectPath) {
      return redirectPath;
    }
  }

  return "/agent/dashboard";
}

export function canAccessPath(pathname: string, roleNames: Array<string | null | undefined>) {
  const normalizedRoles = normalizeRoleNames(roleNames);

  if (normalizedRoles.length === 0) {
    return false;
  }

  if (
    pathname === "/" ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/")
  ) {
    return true;
  }

  const requiredRoles = getRequiredRoles(pathname);
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }

  return requiredRoles.some((role) => normalizedRoles.includes(normalizeRoleName(role)));
}

export function sanitizeRedirectPath(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  if (!input.startsWith("/") || input.startsWith("//")) {
    return null;
  }

  if (isPublicPath(input)) {
    return null;
  }

  return input;
}

export function resolvePostLoginRedirect(options: {
  requestedPath?: string | null;
  storedPath?: string | null;
  roleNames: Array<string | null | undefined>;
}) {
  const requestedPath = sanitizeRedirectPath(options.requestedPath);
  if (requestedPath && canAccessPath(requestedPath, options.roleNames)) {
    return requestedPath;
  }

  const storedPath = sanitizeRedirectPath(options.storedPath);
  if (storedPath && canAccessPath(storedPath, options.roleNames)) {
    return storedPath;
  }

  return getDefaultRedirectPath(options.roleNames);
}

export function buildLoginRedirectPath(pathname: string, search = "") {
  const redirectTarget = sanitizeRedirectPath(`${pathname}${search}`);
  if (!redirectTarget) {
    return "/login";
  }

  const params = new URLSearchParams({ redirect: redirectTarget });
  return `/login?${params.toString()}`;
}
