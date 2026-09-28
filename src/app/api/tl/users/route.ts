import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasTLAccess } from "@/lib/auth/tl-access";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);

    const roleNames = (roleRows ?? []).map(
      (r: { roles: { name: string } | null }) => r.roles?.name?.toLowerCase().replace(/\s+/g, "_")
    );
    const isTL = hasTLAccess(roleNames);
    const isAdmin = roleNames.includes("admin");

    if (!isTL && !isAdmin) {
      return NextResponse.json({ error: "Forbidden: Team Leader or Admin role required" }, { status: 403 });
    }

    const { data: currentProfile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (currentProfile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ users: [], roles: [] });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const [usersRes, rolesRes] = await Promise.all([
      admin
        .from("users")
        .select("id, full_name, email, phone, department, designation, status, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
      admin
        .from("roles")
        .select("*")
        .eq("organization_id", orgId)
        .order("name"),
    ]);

    if (usersRes.error) {
      return NextResponse.json({ error: usersRes.error.message }, { status: 500 });
    }

    type UserRow = { id: string; full_name: string | null; email: string | null; phone: string | null; department: string | null; designation: string | null; status: string; created_at: string };
    const users = (usersRes.data ?? []) as UserRow[];
    const userIds = users.map((u) => u.id);

    let rolesMap: Record<string, { name: string }[]> = {};
    if (userIds.length > 0) {
      const { data: urData } = await admin
        .from("user_roles")
        .select("user_id, roles(name)")
        .in("user_id", userIds);

      const urList = (urData ?? []) as { user_id: string; roles: { name: string } | null }[];
      urList.forEach((ur) => {
        if (ur.roles?.name) {
          if (!rolesMap[ur.user_id]) rolesMap[ur.user_id] = [];
          rolesMap[ur.user_id].push({ name: ur.roles.name });
        }
      });
    }

    const usersWithRoles = users.map((u) => ({
      ...u,
      roles: rolesMap[u.id] ?? [],
    }));

    const roles = rolesRes.data ?? [];
    const agentRoles = roles.filter((r: { name: string }) => r.name?.toLowerCase() === "agent");

    return NextResponse.json({
      users: usersWithRoles,
      roles,
      canManage: true,
      agentOnly: isTL && !isAdmin,
      agentRoleIds: agentRoles.map((r: { id: string }) => r.id),
    });
  } catch (err) {
    console.error("Fetch users error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
