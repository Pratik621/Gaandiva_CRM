import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { resolveDealAssociate } from "@/lib/sales/resolveDealAssociate";

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

  const canAccessSales =
    roleNames.includes("sales") ||
    roleNames.includes("sales_manager") ||
    roleNames.includes("admin");

  if (!canAccessSales) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, roleNames };
}

async function getOrgIdForUser(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("organization_id").eq("id", userId).single();
  return (data as { organization_id: string | null } | null)?.organization_id ?? null;
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

    const body = await request.json();
    const {
      deal_name,
      stage,
      value,
      expected_close_date,
      owner_id,
      pipeline,
      deal_type,
      priority,
      line_items,
      contact_id,
      sales_lead_id,
      deal_associate,
      account_id,
    }: {
      deal_name?: string | null;
      stage?: string | null;
      value?: number | null;
      expected_close_date?: string | null;
      owner_id?: string | null;
      pipeline?: string | null;
      deal_type?: string | null;
      priority?: string | null;
      line_items?: any[] | null;
      contact_id?: string | null;
      sales_lead_id?: string | null;
      deal_associate?: string | null;
      account_id?: string | null;
    } = body ?? {};

    const updatePayload: Record<string, unknown> = {};
    if (deal_name !== undefined && deal_name?.trim()) updatePayload.deal_name = deal_name.trim();
    if (stage !== undefined) updatePayload.stage = stage;
    if (value !== undefined) updatePayload.value = value;
    if (expected_close_date !== undefined) updatePayload.expected_close_date = expected_close_date;
    if (owner_id !== undefined) updatePayload.owner_id = owner_id;
    if (pipeline !== undefined) updatePayload.pipeline = pipeline;
    if (deal_type !== undefined) updatePayload.deal_type = deal_type;
    if (priority !== undefined) updatePayload.priority = priority;
    if (line_items !== undefined) updatePayload.line_items = line_items;
    if (account_id !== undefined) updatePayload.account_id = account_id;

    if (deal_associate !== undefined) {
      const orgId = await getOrgIdForUser(user!.id);
      if (!orgId) {
        return NextResponse.json({ error: "No organization" }, { status: 400 });
      }
      if (deal_associate === null || deal_associate === "") {
        updatePayload.contact_id = null;
        updatePayload.sales_lead_id = null;
      } else {
        try {
          const r = await resolveDealAssociate(admin, orgId, String(deal_associate));
          updatePayload.contact_id = r.contact_id;
          updatePayload.sales_lead_id = r.sales_lead_id;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Invalid contact / lead";
          return NextResponse.json({ error: msg }, { status: 400 });
        }
      }
    } else {
      if (contact_id !== undefined) updatePayload.contact_id = contact_id;
      if (sales_lead_id !== undefined) updatePayload.sales_lead_id = sales_lead_id;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Sales users can only update their own deals; manager/admin can update all.
    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    let query = admin
      .from("deals")
      .update(updatePayload as never)
      .eq("id", params.id)
      .select("id")
      .single();

    if (!isManagerOrAdmin) {
      query = admin
        .from("deals")
        .update(updatePayload as never)
        .eq("id", params.id)
        .eq("owner_id", user!.id)
        .select("id")
        .single();
    }

    const { data, error }: { data: { id: string } | null; error: { message: string } | null } =
      await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: params.id, success: true });
  } catch (err) {
    console.error("Sales deals PATCH error:", err);
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

    let query = admin.from("deals").delete().eq("id", params.id);

    if (!isManagerOrAdmin) {
      query = admin.from("deals").delete().eq("id", params.id).eq("owner_id", user!.id);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: params.id, deleted: true });
  } catch (err) {
    console.error("Sales deals DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

