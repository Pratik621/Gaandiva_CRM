import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

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

export async function GET(request: Request) {
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

    // ── Build tasks query ────────────────────────────────────────────────────
    let query = admin
      .from("tasks")
      .select(
        "id, title, description, related_type, related_id, due_date, priority, status, assigned_to, created_by, organization_id, created_at, updated_at"
      )
      .eq("organization_id", orgId)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (!isManagerOrAdmin) {
      query = query.eq("assigned_to", user!.id);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tasks = (rows ?? []) as Record<string, unknown>[];

    // ── Enrich: assignee + creator names ────────────────────────────────────
    const userIds = Array.from(
      new Set([
        ...tasks.map((t) => t.assigned_to).filter(Boolean) as string[],
        ...tasks.map((t) => t.created_by).filter(Boolean) as string[],
      ])
    );
    let userNames: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach(
        (u) => { userNames[u.id] = u.full_name || u.email || "Unknown"; }
      );
    }

    // ── Enrich: related record names ─────────────────────────────────────────
    const leadIds    = tasks.filter((t) => t.related_type === "lead").map((t) => t.related_id as string).filter(Boolean);
    const contactIds = tasks.filter((t) => t.related_type === "contact").map((t) => t.related_id as string).filter(Boolean);
    const dealIds    = tasks.filter((t) => t.related_type === "deal").map((t) => t.related_id as string).filter(Boolean);

    let leadNames: Record<string, string>    = {};
    let contactNames: Record<string, string> = {};
    let dealNames: Record<string, string>    = {};

    if (leadIds.length > 0) {
      const { data } = await admin.from("sales_leads").select("id, lead_name").in("id", leadIds);
      (data ?? []).forEach((r: Record<string, unknown>) => { leadNames[r.id as string] = (r.lead_name as string) || "—"; });
    }
    if (contactIds.length > 0) {
      const { data } = await admin.from("contacts").select("id, contact_name").in("id", contactIds);
      (data ?? []).forEach((r: Record<string, unknown>) => { contactNames[r.id as string] = (r.contact_name as string) || "—"; });
    }
    if (dealIds.length > 0) {
      const { data } = await admin.from("deals").select("id, deal_name").in("id", dealIds);
      (data ?? []).forEach((r: Record<string, unknown>) => { dealNames[r.id as string] = (r.deal_name as string) || "—"; });
    }

    const shaped = tasks.map((t) => {
      const relType = t.related_type as string | null;
      const relId   = t.related_id  as string | null;
      const relName =
        relType === "lead"    ? leadNames[relId ?? ""]    ?? null
        : relType === "contact" ? contactNames[relId ?? ""] ?? null
        : relType === "deal"    ? dealNames[relId ?? ""]    ?? null
        : null;

      return {
        id:            t.id,
        title:         t.title,
        description:   t.description ?? null,
        related_type:  relType,
        related_id:    relId,
        related_name:  relName,
        due_date:      t.due_date ?? null,
        priority:      t.priority,
        status:        t.status,
        assigned_to:   t.assigned_to ?? null,
        assigned_name: t.assigned_to ? userNames[t.assigned_to as string] ?? null : null,
        created_by:    t.created_by ?? null,
        created_by_name: t.created_by ? userNames[t.created_by as string] ?? null : null,
        created_at:    t.created_at,
        updated_at:    t.updated_at,
      };
    });

    // ── Return members list for form dropdowns ────────────────────────────────
    const { data: orgUsers } = await admin
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId)
      .order("full_name");

    const members = ((orgUsers ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
      (u) => ({ id: u.id, label: u.full_name || u.email || "Unknown" })
    );

    return NextResponse.json({ tasks: shaped, members });
  } catch (err) {
    console.error("Tasks GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const body = await request.json();
    const { title, description, related_type, related_id, due_date, priority, status, assigned_to } =
      body ?? {};

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Sales users can only assign tasks to themselves
    const assignee = isManagerOrAdmin
      ? (assigned_to ?? user!.id)
      : user!.id;

    const payload = {
      title:           title.trim(),
      description:     description?.trim() || null,
      related_type:    related_type || null,
      related_id:      related_id   || null,
      due_date:        due_date     || null,
      priority:        priority     || "medium",
      status:          status       || "pending",
      assigned_to:     assignee,
      created_by:      user!.id,
      organization_id: orgId,
    };

    const { data, error } = await admin
      .from("tasks")
      .insert(payload as never)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const taskId = (data as { id: string }).id;

    // Notify assignee only when a manager/admin assigns a task to someone else
    if (isManagerOrAdmin && assignee !== user!.id) {
      void createNotification({
        title: "New Task Assigned",
        message: `You have been assigned a task: "${title.trim()}"`,
        type: "task",
        sender_id: user!.id,
        receiver_id: assignee,
        reference_type: "task",
        reference_id: taskId,
        organization_id: orgId,
      });
    }

    return NextResponse.json({ id: taskId, success: true }, { status: 201 });
  } catch (err) {
    console.error("Tasks POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
