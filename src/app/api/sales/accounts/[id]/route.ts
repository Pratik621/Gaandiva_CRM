import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getCtx() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };

  const { data: roleRows } = await supabase.from("user_roles").select("roles(name)").eq("user_id", user.id);
  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];
  const canAccess = roleNames.includes("sales") || roleNames.includes("sales_manager") || roleNames.includes("admin");
  if (!canAccess) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { user, orgId, roleNames };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getCtx();
    if ("error" in ctx) return ctx.error;
    const { user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });

    const isManagerOrAdmin = roleNames.includes("sales_manager") || roleNames.includes("admin");

    let q = admin.from("accounts").select("id, company_name, industry, website, phone, address, owner_id, created_at").eq("id", params.id);
    if (!isManagerOrAdmin) q = q.eq("owner_id", user.id);

    const { data, error } = await q.maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const row = data as Record<string, unknown>;
    const ownerId = row.owner_id as string | null;
    let ownerName: string | null = null;
    if (ownerId) {
      const { data: u } = await admin.from("users").select("full_name, email").eq("id", ownerId).maybeSingle();
      const uRow = u as { full_name: string | null; email: string | null } | null;
      ownerName = uRow?.full_name || uRow?.email || null;
    }

    return NextResponse.json({
      account: {
        id: row.id,
        company_name: row.company_name ?? null,
        industry: row.industry ?? null,
        website: row.website ?? null,
        phone: row.phone ?? null,
        address: row.address ?? null,
        owner_id: ownerId,
        owner_name: ownerName,
        created_at: row.created_at,
        updated_at: null,
      },
    });
  } catch (err) {
    console.error("Account GET [id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getCtx();
    if ("error" in ctx) return ctx.error;
    const { user, orgId: _orgId, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });

    const isManagerOrAdmin = roleNames.includes("sales_manager") || roleNames.includes("admin");

    const body = await request.json() as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    const fields = ["company_name", "industry", "website", "phone", "address"] as const;
    fields.forEach((f) => { if (body[f] !== undefined) allowed[f] = body[f] || null; });
    if (isManagerOrAdmin && body.owner_id !== undefined) allowed.owner_id = body.owner_id || null;

    let q = admin.from("accounts").update(allowed as never).eq("id", params.id);
    if (!isManagerOrAdmin) q = q.eq("owner_id", user.id);

    const { error } = await q.select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Account PATCH [id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
