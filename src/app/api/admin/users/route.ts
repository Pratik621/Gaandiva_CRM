import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin role
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);

    const roleNames = (roleRows ?? []).map((r: { roles: { name: string } | null }) => r.roles?.name?.toLowerCase() ?? "");
    const hasUsersAccess = roleNames.some((role) => ["admin", "admin_support"].includes(role));

    if (!hasUsersAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get current user's organization
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
        .select("id, full_name, email, phone, employee_id, department, designation, status, client_id, created_at")
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

    type UserRow = {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      employee_id: string | null;
      department: string | null;
      designation: string | null;
      status: string;
      client_id: string | null;
      created_at: string;
    };
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

    return NextResponse.json({
      users: usersWithRoles,
      roles: (rolesRes.data ?? []).filter(
        (role: { name?: string | null }) => !roleNames.includes("admin_support") || role.name?.toLowerCase() !== "admin"
      ),
    });
  } catch (err) {
    console.error("Fetch users error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
