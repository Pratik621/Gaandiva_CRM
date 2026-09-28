import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getCtx() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: roleRows } = await supabase.from("user_roles").select("roles(name)").eq("user_id", user.id);
  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];
  const can = roleNames.includes("sales") || roleNames.includes("sales_manager") || roleNames.includes("admin");
  if (!can) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, roleNames };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getCtx();
    if ("error" in ctx) return ctx.error;
    const { user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });

    const isManagerOrAdmin = roleNames.includes("sales_manager") || roleNames.includes("admin");

    let q = admin
      .from("deals")
      .select("id, deal_name, value, stage, owner_id, expected_close_date, created_at")
      .eq("account_id", params.id)
      .order("created_at", { ascending: false });

    if (!isManagerOrAdmin) q = q.eq("owner_id", user.id);

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const deals = (rows ?? []) as Record<string, unknown>[];
    const ownerIds = Array.from(new Set(deals.map((d) => d.owner_id).filter(Boolean) as string[]));
    const names: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: users } = await admin.from("users").select("id, full_name, email").in("id", ownerIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach((u) => {
        names[u.id] = u.full_name || u.email || "Unknown";
      });
    }

    const shaped = deals.map((d) => ({
      id: d.id as string,
      deal_name: (d.deal_name as string | null) ?? null,
      value: d.value ?? null,
      stage: (d.stage as string | null) ?? null,
      owner_name: d.owner_id ? names[d.owner_id as string] ?? "—" : null,
      expected_close_date: (d.expected_close_date as string | null) ?? null,
      created_at: d.created_at as string,
    }));

    return NextResponse.json({ deals: shaped });
  } catch (err) {
    console.error("Account deals GET:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
