import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);

    const hasUsersAccess = (roleRows ?? []).some(
      (r: { roles: { name: string } | null }) => ["admin", "admin_support"].includes(r.roles?.name?.toLowerCase() ?? "")
    );
    if (!hasUsersAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) return NextResponse.json({ clients: [] });

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data, error } = await admin
      .from("clients")
      .select("id, company_name")
      .eq("organization_id", orgId)
      .order("company_name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const clients = ((data ?? []) as Array<{ id: string; company_name: string | null }>).map(
      (c) => ({ id: c.id, name: c.company_name ?? c.id })
    );

    return NextResponse.json({ clients });
  } catch (err) {
    console.error("GET /api/clients error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

