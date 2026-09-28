import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { verifyOrgAdmin } from "@/lib/devices/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await verifyOrgAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as Exclude<
      Awaited<ReturnType<typeof verifyOrgAdmin>>,
      { error: NextResponse }
    >;

    const supabase = await createClient();
    const { data } = await supabase
      .from("org_device_settings")
      .select("enabled, grace_ends_at, updated_at")
      .eq("organization_id", orgId)
      .maybeSingle();

    return NextResponse.json({
      settings: data ?? { enabled: false, grace_ends_at: null },
    });
  } catch (err) {
    console.error("[admin/device-settings] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await verifyOrgAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as Exclude<
      Awaited<ReturnType<typeof verifyOrgAdmin>>,
      { error: NextResponse }
    >;

    const body = (await request.json()) as {
      enabled?: boolean;
      graceDays?: number;
    };

    const enabled = Boolean(body.enabled);
    let graceEndsAt: string | null = null;
    if (enabled) {
      const days =
        typeof body.graceDays === "number" && Number.isFinite(body.graceDays)
          ? Math.max(0, Math.floor(body.graceDays))
          : 7;
      graceEndsAt =
        days === 0
          ? new Date(Date.now() - 60_000).toISOString()
          : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { error } = await admin.from("org_device_settings").upsert(
      {
        organization_id: orgId,
        enabled,
        grace_ends_at: graceEndsAt,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "organization_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, enabled, graceEndsAt });
  } catch (err) {
    console.error("[admin/device-settings] PUT error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
