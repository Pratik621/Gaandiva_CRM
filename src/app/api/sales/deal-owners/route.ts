import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function normalizeRoleName(name: string | null | undefined) {
  return (name ?? "").toLowerCase().trim().replace(/\s+/g, "_");
}

/** Roles that can own / be assigned deals in the sales CRM */
const DEAL_OWNER_ROLE_NORMALIZED = new Set(["sales", "sales_manager"]);

async function getUserAndOrg() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);
  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => normalizeRoleName(r.roles?.name))
    .filter(Boolean);

  const canAccess =
    roleNames.includes("sales") || roleNames.includes("sales_manager") || roleNames.includes("admin");
  if (!canAccess) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, orgId };
}

export async function GET() {
  try {
    const ctx = await getUserAndOrg();
    if ("error" in ctx) return ctx.error;
    const { orgId } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data: orgRoles, error: rolesErr } = await admin.from("roles").select("id, name").eq("organization_id", orgId);
    if (rolesErr) {
      return NextResponse.json({ error: rolesErr.message }, { status: 500 });
    }

    const salesRoleIds = ((orgRoles ?? []) as { id: string; name: string | null }[])
      .filter((r) => DEAL_OWNER_ROLE_NORMALIZED.has(normalizeRoleName(r.name)))
      .map((r) => r.id);

    if (salesRoleIds.length === 0) {
      return NextResponse.json({ users: [] as { id: string; full_name: string | null; email: string | null }[] });
    }

    const { data: urRows, error: urErr } = await admin.from("user_roles").select("user_id").in("role_id", salesRoleIds);
    if (urErr) {
      return NextResponse.json({ error: urErr.message }, { status: 500 });
    }

    const userIds = [...new Set(((urRows ?? []) as { user_id: string }[]).map((r) => r.user_id))];
    if (userIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const { data: userRows, error: usersErr } = await admin
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId)
      .in("id", userIds)
      .order("full_name", { ascending: true });

    if (usersErr) {
      return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    const users = ((userRows ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((u) => ({
      id: u.id,
      full_name: u.full_name ?? null,
      email: u.email ?? null,
    }));

    return NextResponse.json({ users });
  } catch (err) {
    console.error("Sales deal-owners GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
