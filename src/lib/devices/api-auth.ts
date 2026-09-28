import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeRoleName } from "@/lib/auth/config";

export async function getDeviceApiUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("users").select("organization_id, full_name, email").eq("id", user.id).single(),
    supabase.from("user_roles").select("roles(name)").eq("user_id", user.id),
  ]);

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  const roles = (roleRows ?? [])
    .map((r: { roles: { name: string } | null }) => normalizeRoleName(r.roles?.name))
    .filter(Boolean);
  const primaryRole = roles[0] ?? "user";
  const isAdmin = roles.includes("admin");
  const isAdminSupport = roles.includes("admin_support");
  const fullName =
    (profile as { full_name: string | null; email: string | null } | null)?.full_name?.trim() ||
    (profile as { email: string | null } | null)?.email ||
    "User";

  return {
    supabase,
    user,
    orgId,
    roles,
    primaryRole,
    isAdmin,
    isAdminSupport,
    fullName,
  };
}

export async function verifyOrgAdmin() {
  const ctx = await getDeviceApiUser();
  if ("error" in ctx && ctx.error) return { error: ctx.error };
  const c = ctx as Awaited<ReturnType<typeof getDeviceApiUser>> & { error?: undefined };
  if (!("isAdmin" in c) || (!c.isAdmin && !c.isAdminSupport)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return c;
}

/** Lead Finder: Admin, Operations Manager, Team Leader, and Email Marketing Manager. */
export async function verifyLeadFinderAccess() {
  const ctx = await getDeviceApiUser();
  if ("error" in ctx && ctx.error) return { error: ctx.error };
  const c = ctx as Awaited<ReturnType<typeof getDeviceApiUser>> & { error?: undefined };
  const allowed =
    "roles" in c &&
    (c.isAdmin ||
      c.roles.includes("operations_manager") ||
      c.roles.includes("team_leader") ||
      c.roles.includes("tl") ||
      c.roles.includes("email_marketing_manager"));
  if (!allowed) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return c;
}
