import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getUserAndRoles() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];

  const canAccess =
    roleNames.includes("sales") ||
    roleNames.includes("sales_manager") ||
    roleNames.includes("admin");

  if (!canAccess) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, roleNames };
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getUserAndRoles();
    if ("error" in ctx) return ctx.error;
    const { user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    // Non-managers can only edit their own activities
    const { data: existing } = await admin
      .from("activities")
      .select("id, owner_id")
      .eq("id", params.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    if (!isManagerOrAdmin && (existing as { owner_id: string }).owner_id !== user!.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { activity_type, related_to_type, related_to_id, notes, activity_date } = body ?? {};

    const updatePayload: Record<string, unknown> = {};
    if (activity_type !== undefined) updatePayload.activity_type = activity_type;
    if (related_to_type !== undefined) updatePayload.related_to_type = related_to_type;
    if (related_to_id !== undefined) updatePayload.related_to_id = related_to_id;
    if (notes !== undefined) updatePayload.notes = notes;
    if (activity_date !== undefined) updatePayload.activity_date = activity_date;

    const { error } = await admin
      .from("activities")
      .update(updatePayload as never)
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Activities PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getUserAndRoles();
    if ("error" in ctx) return ctx.error;
    const { user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    const { data: existing } = await admin
      .from("activities")
      .select("id, owner_id")
      .eq("id", params.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    if (!isManagerOrAdmin && (existing as { owner_id: string }).owner_id !== user!.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await admin
      .from("activities")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Activities DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
