import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { roleRequiresClientBinding } from "@/lib/admin/client-binding-roles";
import { logAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

async function verifyAdmin(): Promise<{
  error: NextResponse | null;
  user: { id: string } | null;
  orgId: string | null;
  isAdminSupport?: boolean;
}> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null, orgId: null };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const actorRoles = (roleRows ?? []).map(
    (r: { roles: { name: string } | null }) => r.roles?.name?.toLowerCase() ?? ""
  );
  const hasUsersAccess = actorRoles.some((role) => ["admin", "admin_support"].includes(role));

  if (!hasUsersAccess) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), user: null, orgId: null };
  }

  const { data: currentProfile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (currentProfile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "Your account is not assigned to an organization" }, { status: 400 }), user: null, orgId: null };
  }

  return { error: null, user, orgId, isAdminSupport: actorRoles.includes("admin_support") && !actorRoles.includes("admin") };
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authErr, user: adminUser, orgId, isAdminSupport } = await verifyAdmin();
    if (authErr) return authErr;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const body = await _request.json();
    const { status, password } = body as {
      status?: string;
      full_name?: string | null;
      department?: string | null;
      designation?: string | null;
      role_id?: string | null;
      client_id?: string | null;
      phone?: string | null;
      employee_id?: string | null;
      password?: string;
    };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    // Ensure user belongs to same org
    const { data: targetUser, error: fetchErr } = await admin
      .from("users")
      .select("id, organization_id")
      .eq("id", id)
      .single();

    if (fetchErr || !targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const typedTarget = targetUser as { id: string; organization_id: string | null };
    if (typedTarget.organization_id !== orgId) {
      return NextResponse.json({ error: "Cannot update user from another organization" }, { status: 403 });
    }

    const { data: targetRoleRows } = await admin
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", id);
    const targetIsAdmin = (targetRoleRows ?? []).some(
      (row: { roles: { name: string } | null }) => row.roles?.name?.toLowerCase() === "admin"
    );
    if (isAdminSupport && targetIsAdmin) {
      return NextResponse.json({ error: "Admin Support cannot manage Admin users" }, { status: 403 });
    }

    if (status && !["active", "inactive"].includes(status)) {
      return NextResponse.json({ error: "Valid status (active/inactive) required" }, { status: 400 });
    }

    if (id === adminUser?.id && status === "inactive") {
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
    }

    if (password !== undefined && password !== null && String(password).trim() !== "") {
      if (typeof password !== "string") {
        return NextResponse.json({ error: "Invalid password" }, { status: 400 });
      }
      const trimmed = password.trim();
      if (trimmed.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 }
        );
      }
      const { error: passwordError } = await admin.auth.admin.updateUserById(id, {
        password: trimmed,
      });
      if (passwordError) {
        return NextResponse.json(
          { error: passwordError.message || "Failed to update password" },
          { status: 400 }
        );
      }
    }

    const userUpdate: Record<string, unknown> = {};
    if (typeof status === "string") userUpdate.status = status;
    if ("full_name" in body) userUpdate.full_name = body.full_name?.trim() || null;
    if ("department" in body) userUpdate.department = body.department?.trim() || null;
    if ("designation" in body) userUpdate.designation = body.designation?.trim() || null;

    let roleNameNormalized = "";
    if (body.role_id && typeof body.role_id === "string") {
      const { data: roleRow } = await admin
        .from("roles")
        .select("name")
        .eq("id", body.role_id)
        .single();
      roleNameNormalized = ((roleRow as { name?: string } | null)?.name ?? "")
        .toLowerCase()
        .replace(/\s+/g, "_");
    } else {
      // Preserve existing role when role_id is not being changed
      const { data: existingRoleRows } = await admin
        .from("user_roles")
        .select("roles(name)")
        .eq("user_id", id);
      const existingName = (
        (existingRoleRows ?? [])[0] as { roles: { name: string } | null } | undefined
      )?.roles?.name;
      roleNameNormalized = (existingName ?? "").toLowerCase().replace(/\s+/g, "_");
    }

    if (isAdminSupport && roleNameNormalized === "admin") {
      return NextResponse.json({ error: "Admin Support cannot assign the Admin role" }, { status: 403 });
    }

    if (body.role_id && roleRequiresClientBinding(roleNameNormalized) && !body.client_id) {
      return NextResponse.json(
        { error: "Client selection is required for this role" },
        { status: 400 }
      );
    }

    if ("client_id" in body || body.role_id) {
      userUpdate.client_id = roleRequiresClientBinding(roleNameNormalized)
        ? (body.client_id ?? null)
        : null;
    }

    // Employee ID / mobile are not managed for client_viewer
    if (roleNameNormalized !== "client_viewer") {
      if ("phone" in body) {
        userUpdate.phone =
          typeof body.phone === "string" ? body.phone.trim() || null : null;
      }
      if ("employee_id" in body) {
        userUpdate.employee_id =
          typeof body.employee_id === "string" ? body.employee_id.trim() || null : null;
      }
    }

    if (Object.keys(userUpdate).length > 0) {
      const { error: updateError } = await admin
        .from("users")
        .update(userUpdate as never)
        .eq("id", id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    if (body.role_id && typeof body.role_id === "string") {
      const { data: existingRoles } = await admin
        .from("user_roles")
        .select("role_id")
        .eq("user_id", id);

      const roleIds = (existingRoles ?? []).map((r: { role_id: string }) => r.role_id);
      if (!roleIds.includes(body.role_id)) {
        if (roleIds.length > 0) {
          await admin.from("user_roles").delete().eq("user_id", id);
        }
        const { error: addRoleErr } = await admin
          .from("user_roles")
          .insert({ user_id: id, role_id: body.role_id } as never);
        if (addRoleErr) {
          return NextResponse.json({ error: addRoleErr.message }, { status: 500 });
        }
      }
    }
    const passwordUpdated =
      password !== undefined && password !== null && String(password).trim() !== "";

    const changedFields = [
      ...Object.keys(userUpdate),
      ...(body.role_id ? ["role"] : []),
      ...(passwordUpdated ? ["password"] : []),
    ];
    void logAudit({
      organizationId: orgId!,
      actorId: adminUser?.id ?? null,
      actorRole: "admin",
      category: body.role_id ? "permissions" : "users",
      eventType:
        status === "inactive"
          ? "user_deactivated"
          : body.role_id
          ? "user_role_changed"
          : "user_updated",
      description:
        status === "inactive"
          ? "Deactivated user account"
          : body.role_id
          ? `Changed user role to ${roleNameNormalized || body.role_id}`
          : `Updated user (${changedFields.join(", ") || "no changes"})`,
      targetType: "user",
      targetId: id,
      metadata: { changed_fields: changedFields, new_status: status ?? null, new_role: roleNameNormalized || null },
      request: _request,
    });

    return NextResponse.json({
      success: true,
      status: status ?? null,
      password_updated: passwordUpdated,
    });
  } catch (err) {
    console.error("Update user status error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authErr, user: adminUser, orgId, isAdminSupport } = await verifyAdmin();
    if (authErr) return authErr;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    // Ensure user belongs to same org
    const { data: targetUser, error: fetchErr } = await admin
      .from("users")
      .select("id, organization_id")
      .eq("id", id)
      .single();

    if (fetchErr || !targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const typedTarget = targetUser as { id: string; organization_id: string | null };
    if (typedTarget.organization_id !== orgId) {
      return NextResponse.json({ error: "Cannot delete user from another organization" }, { status: 403 });
    }

    const { data: targetRoleRows } = await admin
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", id);
    const targetIsAdmin = (targetRoleRows ?? []).some(
      (row: { roles: { name: string } | null }) => row.roles?.name?.toLowerCase() === "admin"
    );
    if (isAdminSupport && targetIsAdmin) {
      return NextResponse.json({ error: "Admin Support cannot manage Admin users" }, { status: 403 });
    }

    if (id === adminUser?.id) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }

    // Delete from auth.users - this cascades to public.users via ON DELETE CASCADE
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(id);

    if (deleteAuthError) {
      return NextResponse.json(
        { error: deleteAuthError.message || "Failed to delete user" },
        { status: 500 }
      );
    }

    void logAudit({
      organizationId: orgId!,
      actorId: adminUser?.id ?? null,
      actorRole: "admin",
      category: "users",
      eventType: "user_deleted",
      description: "Permanently deleted user account",
      targetType: "user",
      targetId: id,
      request: _request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete user error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
