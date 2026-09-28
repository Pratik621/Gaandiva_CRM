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
      .from("sales_tickets")
      .select("id, subject, status, priority, description, created_by, created_at, updated_at")
      .eq("organization_id", orgId)
      .eq("sales_lead_id", params.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tickets = (rows ?? []) as Record<string, unknown>[];
    const creatorIds = Array.from(
      new Set(tickets.map((t) => t.created_by).filter(Boolean) as string[])
    );
    const userNames: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", creatorIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach(
        (u) => {
          userNames[u.id] = u.full_name || u.email || "Unknown";
        }
      );
    }

    const shaped = tickets.map((t) => ({
      id: t.id as string,
      subject: t.subject as string,
      status: t.status as string,
      priority: t.priority as string,
      description: (t.description as string | null) ?? null,
      created_by_name: t.created_by ? userNames[t.created_by as string] ?? "—" : null,
      created_at: t.created_at as string,
      updated_at: t.updated_at as string,
    }));

    return NextResponse.json({ tickets: shaped });
  } catch (err) {
    console.error("Lead tickets GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
    const subject = String(body?.subject ?? "").trim();
    const description = body?.description ? String(body.description) : null;
    const priority = (body?.priority as string) || "medium";
    const status = (body?.status as string) || "open";

    if (!subject) {
      return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("sales_tickets")
      .insert({
        organization_id: orgId,
        sales_lead_id: params.id,
        subject,
        description,
        priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
        status: ["open", "pending", "resolved", "closed"].includes(status) ? status : "open",
        created_by: user.id,
      } as never)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: (data as { id: string }).id, success: true }, { status: 201 });
  } catch (err) {
    console.error("Lead tickets POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
