import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const hasUsersAccess = (roleRows ?? []).some(
    (r: { roles: { name: string } | null }) => ["admin", "admin_support"].includes(r.roles?.name?.toLowerCase() ?? "")
  );
  if (!hasUsersAccess) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
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

  return { orgId };
}

export async function GET() {
  try {
    const auth = await verifyAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const supabase = await createClient();
    const { data } = await supabase
      .from("org_mfa_settings")
      .select("enforced, grace_ends_at, updated_at")
      .eq("organization_id", orgId)
      .maybeSingle();

    return NextResponse.json({
      settings: data ?? { enforced: false, grace_ends_at: null },
    });
  } catch (err) {
    console.error("[admin/mfa-settings] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await verifyAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const body = (await request.json()) as {
      enforced?: boolean;
      graceDays?: number;
    };

    const enforced = Boolean(body.enforced);
    let graceEndsAt: string | null = null;
    if (enforced) {
      const days =
        typeof body.graceDays === "number" && Number.isFinite(body.graceDays)
          ? Math.max(0, Math.floor(body.graceDays))
          : 7;
      // 0 days = grace already over → hard-block on next login
      graceEndsAt =
        days === 0
          ? new Date(Date.now() - 60_000).toISOString()
          : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { error } = await admin.from("org_mfa_settings").upsert(
      {
        organization_id: orgId,
        enforced,
        grace_ends_at: graceEndsAt,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "organization_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, enforced, graceEndsAt });
  } catch (err) {
    console.error("[admin/mfa-settings] PUT error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
