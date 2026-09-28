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

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
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

  return { user, orgId, roleNames };
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getUserAndRoles();
    if ("error" in ctx) return ctx.error;
    const { user, orgId, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    const { data: existing } = await admin
      .from("tasks")
      .select("id, assigned_to, created_by, organization_id")
      .eq("id", params.id)
      .eq("organization_id", orgId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const task = existing as { assigned_to: string | null; created_by: string | null };

    // Sales can only update tasks assigned to them
    if (!isManagerOrAdmin && task.assigned_to !== user!.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, related_type, related_id, due_date, priority, status, assigned_to } =
      body ?? {};

    const update: Record<string, unknown> = {};
    if (title       !== undefined) update.title        = title?.trim() || null;
    if (description !== undefined) update.description  = description?.trim() || null;
    if (related_type !== undefined) update.related_type = related_type || null;
    if (related_id  !== undefined) update.related_id   = related_id   || null;
    if (due_date    !== undefined) update.due_date      = due_date     || null;
    if (priority    !== undefined) update.priority      = priority;
    if (status      !== undefined) update.status        = status;
    // Only managers/admins can reassign tasks
    if (assigned_to !== undefined && isManagerOrAdmin) {
      update.assigned_to = assigned_to;
    }

    const { error } = await admin
      .from("tasks")
      .update(update as never)
      .eq("id", params.id)
      .eq("organization_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Tasks PATCH error:", err);
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
    const { user, orgId, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const isAdmin      = roleNames.includes("admin");
    const isManager    = roleNames.includes("sales_manager");

    const { data: existing } = await admin
      .from("tasks")
      .select("id, assigned_to, created_by, organization_id")
      .eq("id", params.id)
      .eq("organization_id", orgId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const task = existing as { assigned_to: string | null; created_by: string | null };

    // Permission: admin deletes any, manager deletes any in org,
    // sales can only delete tasks they created
    const canDelete =
      isAdmin ||
      isManager ||
      task.created_by === user!.id;

    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden: you can only delete tasks you created" }, { status: 403 });
    }

    const { error } = await admin
      .from("tasks")
      .delete()
      .eq("id", params.id)
      .eq("organization_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Tasks DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
