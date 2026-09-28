import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), orgId: null };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const isAdmin = (roleRows ?? []).some(
    (r: { roles: { name: string } | null }) => r.roles?.name?.toLowerCase() === "admin"
  );

  if (!isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 }), orgId: null };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  return { error: null, orgId, userId: user.id };
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Role ID required" }, { status: 400 });
  const { error, orgId, userId } = await verifyAdmin();
  if (error) return error;
  if (!orgId) return NextResponse.json({ error: "No organization assigned" }, { status: 400 });

  const body = await _request.json();
  const { name, description } = body;

  const admin = getAdminClientSafe();
  if (!admin) {
    return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const updateData: { name?: string; description?: string | null } = {};
  if (typeof name === "string" && name.trim()) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description?.trim() || null;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error: updateError } = await admin
    .from("roles")
    .update(updateData as never)
    .eq("id", id)
    .eq("organization_id", orgId)
    .select()
    .single();

  if (updateError) {
    if (updateError.code === "23505") {
      return NextResponse.json({ error: "Role name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  void logAudit({
    organizationId: orgId,
    actorId: userId ?? null,
    actorRole: "admin",
    category: "permissions",
    eventType: "role_updated",
    description: `Updated role "${(data as { name?: string }).name ?? id}"`,
    targetType: "role",
    targetId: id,
    targetLabel: (data as { name?: string }).name ?? null,
    metadata: { changes: updateData },
    request: _request,
  });

  return NextResponse.json({ role: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Role ID required" }, { status: 400 });
  const { error, orgId, userId } = await verifyAdmin();
  if (error) return error;
  if (!orgId) return NextResponse.json({ error: "No organization assigned" }, { status: 400 });

  const admin = getAdminClientSafe();
  if (!admin) {
    return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const { data: roleRow } = await admin
    .from("roles")
    .select("name")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  const { error: deleteError } = await admin
    .from("roles")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  void logAudit({
    organizationId: orgId,
    actorId: userId ?? null,
    actorRole: "admin",
    category: "permissions",
    eventType: "role_deleted",
    description: `Deleted role "${(roleRow as { name?: string } | null)?.name ?? id}"`,
    targetType: "role",
    targetId: id,
    targetLabel: (roleRow as { name?: string } | null)?.name ?? null,
    request: _request,
  });

  return NextResponse.json({ success: true });
}
