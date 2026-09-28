import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { fetchSalesLeadIfAccessible } from "@/lib/sales/canAccessSalesLead";

export const dynamic = "force-dynamic";

async function getCtx() {
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

  const can =
    roleNames.includes("sales") ||
    roleNames.includes("sales_manager") ||
    roleNames.includes("admin");
  if (!can) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, orgId, roleNames };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getCtx();
    if ("error" in ctx) return ctx.error;
    const { orgId, user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    const lead = await fetchSalesLeadIfAccessible(admin, orgId, params.id, {
      userId: user.id,
      isManagerOrAdmin,
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { data: rows, error } = await admin
      .from("activities")
      .select("id, activity_type, related_to_type, related_to_id, notes, activity_date, owner_id, created_at")
      .eq("related_to_type", "lead")
      .eq("related_to_id", params.id)
      .order("activity_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const activities = (rows ?? []) as Record<string, unknown>[];
    const ownerIds = Array.from(
      new Set(activities.map((a) => a.owner_id).filter(Boolean) as string[])
    );
    const userNames: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", ownerIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach(
        (u) => {
          userNames[u.id] = u.full_name || u.email || "Unknown";
        }
      );
    }

    const shaped = activities.map((a) => ({
      id: a.id as string,
      activity_type: a.activity_type as string,
      related_to_type: a.related_to_type as string,
      related_to_id: a.related_to_id as string,
      notes: (a.notes as string | null) ?? null,
      activity_date: a.activity_date as string,
      owner_id: (a.owner_id as string | null) ?? null,
      owner_name: a.owner_id ? userNames[a.owner_id as string] ?? "—" : null,
      created_at: a.created_at as string,
    }));

    return NextResponse.json({ activities: shaped });
  } catch (err) {
    console.error("Lead activities GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const ALLOWED_TYPES = new Set([
  "call",
  "meeting",
  "email",
  "demo",
  "note",
  "task",
]);

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getCtx();
    if ("error" in ctx) return ctx.error;
    const { orgId, user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    const lead = await fetchSalesLeadIfAccessible(admin, orgId, params.id, {
      userId: user.id,
      isManagerOrAdmin,
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const body = await request.json();
    const activity_type = body?.activity_type as string | undefined;
    const notes = (body?.notes as string | null) ?? null;
    const activity_date = (body?.activity_date as string | null) ?? new Date().toISOString();

    if (!activity_type || !ALLOWED_TYPES.has(activity_type)) {
      return NextResponse.json({ error: "Invalid or missing activity_type" }, { status: 400 });
    }
    if (activity_type === "note" && (!notes || !String(notes).trim())) {
      return NextResponse.json({ error: "Note text is required" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("activities")
      .insert({
        activity_type,
        related_to_type: "lead",
        related_to_id: params.id,
        notes: notes?.trim() || null,
        activity_date,
        owner_id: user.id,
      } as never)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: (data as { id: string }).id, success: true }, { status: 201 });
  } catch (err) {
    console.error("Lead activities POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
