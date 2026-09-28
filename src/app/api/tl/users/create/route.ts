import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasTLAccess } from "@/lib/auth/tl-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

    const body = await request.json();
    const { email, password, full_name, role_id, department, designation } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const { data: currentProfile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (currentProfile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json(
        { error: "Your account is not assigned to an organization" },
        { status: 400 }
      );
    }

    let finalRoleId: string | null = role_id || null;

    if (isTL && !isAdmin) {
      if (!finalRoleId) {
        return NextResponse.json(
          { error: "Team Leaders can only create users with Agent role" },
          { status: 400 }
        );
      }
      const { data: roleData } = await supabase
        .from("roles")
        .select("id, name")
        .eq("id", finalRoleId)
        .eq("organization_id", orgId)
        .single();

      const roleName = (roleData as { name?: string } | null)?.name?.toLowerCase();
      if (!roleData || roleName !== "agent") {
        return NextResponse.json(
          { error: "Team Leaders can only create users with Agent role" },
          { status: 400 }
        );
      }
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data: createData, error: createError } = await admin.auth.admin.createUser({
      email: email.trim(),
      password: password.trim(),
      email_confirm: true,
      user_metadata: { full_name: full_name?.trim() || undefined },
    });

    if (createError) {
      return NextResponse.json(
        { error: createError.message || "Failed to create user" },
        { status: 400 }
      );
    }

    const createdUserId = createData.user?.id;
    if (!createdUserId) {
      return NextResponse.json({ error: "User creation succeeded but no user ID returned" }, { status: 500 });
    }

    const { error: updateError } = await admin
      .from("users")
      .update({
        organization_id: orgId,
        full_name: full_name?.trim() || null,
        department: department?.trim() || null,
        designation: designation?.trim() || null,
        ...(isTL && !isAdmin ? { reporting_manager_id: user.id } : {}),
      } as never)
      .eq("id", createdUserId);

    if (updateError) {
      return NextResponse.json(
        { error: "User created but profile update failed: " + updateError.message },
        { status: 500 }
      );
    }

    if (finalRoleId) {
      const { error: roleError } = await admin
        .from("user_roles")
        .insert({ user_id: createdUserId, role_id: finalRoleId } as never);

      if (roleError) {
        return NextResponse.json(
          { error: "User created but role assignment failed: " + roleError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      user_id: createdUserId,
      message: "User created successfully. They can login with email and password.",
    });
  } catch (err) {
    console.error("Create user error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
