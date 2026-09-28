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

  const canAccessSales =
    roleNames.includes("sales") ||
    roleNames.includes("sales_manager") ||
    roleNames.includes("admin");

  if (!canAccessSales) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, roleNames };
}

export async function GET() {
  try {
    const ctx = await getUserAndRoles();
    if ("error" in ctx) return ctx.error;
    const { user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    let query = admin
      .from("accounts")
      .select("id, company_name, industry, website, phone, address, owner_id, created_at")
      .order("created_at", { ascending: false });

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    if (!isManagerOrAdmin) {
      // Sales users see only their own accounts.
      query = query.eq("owner_id", user!.id);
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const accounts = (rows ?? []) as {
      id: string;
      company_name: string | null;
      industry: string | null;
      website: string | null;
      phone: string | null;
      address: string | null;
      owner_id: string | null;
      created_at: string;
    }[];

    const ownerIds = Array.from(
      new Set(accounts.map((a) => a.owner_id).filter(Boolean) as string[])
    );

    let ownerNames: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", ownerIds);

      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach(
        (u) => {
          ownerNames[u.id] = u.full_name || u.email || "Unknown";
        }
      );
    }

    const shapedAccounts = accounts.map((a) => ({
      id: a.id,
      company_name: a.company_name,
      industry: a.industry,
      website: a.website,
      phone: a.phone,
      address: a.address,
      owner_id: a.owner_id,
      owner_name: a.owner_id ? ownerNames[a.owner_id] ?? "—" : null,
      created_at: a.created_at,
    }));

    return NextResponse.json({ accounts: shapedAccounts });
  } catch (err) {
    console.error("Sales accounts GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getUserAndRoles();
    if ("error" in ctx) return ctx.error;
    const { user } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = await request.json();
    const {
      company_name,
      industry,
      website,
      phone,
      address,
      owner_id,
    }: {
      company_name?: string;
      industry?: string | null;
      website?: string | null;
      phone?: string | null;
      address?: string | null;
      owner_id?: string | null;
    } = body ?? {};

    if (!company_name || !company_name.trim()) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const insertPayload = {
      company_name: company_name.trim(),
      industry: industry ?? null,
      website: website ?? null,
      phone: phone ?? null,
      address: address ?? null,
      owner_id: owner_id ?? user!.id,
    };

    const { data, error } = await admin
      .from("accounts")
      .insert(insertPayload as never)
      .select("id, company_name, industry, website, phone, address, owner_id, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ account: data }, { status: 201 });
  } catch (err) {
    console.error("Sales accounts POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

