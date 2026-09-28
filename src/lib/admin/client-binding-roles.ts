/** Roles that bind to a client record and use client logo in the app header. */
export const ROLES_WITH_CLIENT_BINDING = ["client_viewer", "dc"] as const;

export function roleRequiresClientBinding(roleName: string): boolean {
  const normalized = roleName.toLowerCase().trim().replace(/\s+/g, "_");
  return (ROLES_WITH_CLIENT_BINDING as readonly string[]).includes(normalized);
}
