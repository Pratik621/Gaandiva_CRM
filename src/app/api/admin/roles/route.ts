import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null, orgId: null };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const isAdmin = (roleRows ?? []).some(
    (r: { roles: { name: string } | null }) => r.roles?.name?.toLowerCase() === "admin"
  );

  if (!isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 }), user: null, orgId: null };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization assigned" }, { status: 400 }), user, orgId: null };
  }

  return { error: null, user, orgId };
}

export async function GET() {
  const { error, orgId } = await verifyAdmin();
  if (error) return error;
  if (!orgId) return NextResponse.json({ roles: [] });

  const admin = getAdminClientSafe();
  if (!admin) {
    return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }
  const { data, error: fetchError } = await admin
    .from("roles")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  return NextResponse.json({ roles: data ?? [] });
}

export async function POST(request: Request) {
  const { error, user, orgId } = await verifyAdmin();
  if (error) return error;
  if (!orgId) return NextResponse.json({ error: "No organization assigned" }, { status: 400 });

  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  }

  const admin = getAdminClientSafe();
  if (!admin) {
    return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }
  const { data, error: insertError } = await admin
    .from("roles")
    .insert({
      organization_id: orgId,
      name: name.trim(),
      description: description?.trim() || null,
    } as never)
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: `Role "${name.trim()}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  void logAudit({
    organizationId: orgId,
    actorId: user?.id ?? null,
    actorRole: "admin",
    category: "permissions",
    eventType: "role_created",
    description: `Created role "${name.trim()}"`,
    targetType: "role",
    targetId: (data as { id?: string } | null)?.id ?? null,
    targetLabel: name.trim(),
    request,
  });

  return NextResponse.json({ role: data });
}
