import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasTLAccess } from "@/lib/auth/tl-access";

export const dynamic = "force-dynamic";

async function verifyTLOrAdmin(): Promise<{
  error: NextResponse | null;
  user: { id: string } | null;
  orgId: string | null;
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

  const roleNames = (roleRows ?? []).map(
    (r: { roles: { name: string } | null }) => r.roles?.name?.toLowerCase().replace(/\s+/g, "_")
  );
  const isTL = hasTLAccess(roleNames);
  const isAdmin = roleNames.includes("admin");

  if (!isTL && !isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden: Team Leader or Admin role required" }, { status: 403 }), user: null, orgId: null };
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

  return { error: null, user, orgId };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authErr, user: currentUser, orgId } = await verifyTLOrAdmin();
    if (authErr) return authErr;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const body = await request.json();
    const { status, full_name, department, designation } = body;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

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

    if (status !== undefined) {
      if (!["active", "inactive"].includes(status)) {
        return NextResponse.json({ error: "Valid status (active/inactive) required" }, { status: 400 });
      }
      if (id === currentUser?.id && status === "inactive") {
        return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
      }
      const { error: updateError } = await admin
        .from("users")
        .update({ status } as never)
        .eq("id", id);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    if (full_name !== undefined || department !== undefined || designation !== undefined) {
      const updates: Record<string, unknown> = {};
      if (full_name !== undefined) updates.full_name = full_name?.trim() || null;
      if (department !== undefined) updates.department = department?.trim() || null;
      if (designation !== undefined) updates.designation = designation?.trim() || null;
      const { error: updateError } = await admin
        .from("users")
        .update(updates as never)
        .eq("id", id);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update user error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authErr, user: currentUser, orgId } = await verifyTLOrAdmin();
    if (authErr) return authErr;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    if (id === currentUser?.id) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

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

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(id);

    if (deleteAuthError) {
      return NextResponse.json(
        { error: deleteAuthError.message || "Failed to delete user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete user error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
