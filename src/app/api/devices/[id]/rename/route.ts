import { NextResponse } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { getDeviceApiUser } from "@/lib/devices/api-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getDeviceApiUser();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { user, orgId } = ctx as Exclude<
      Awaited<ReturnType<typeof getDeviceApiUser>>,
      { error: NextResponse }
    >;

    const body = (await request.json()) as { deviceName?: string };
    const name = body.deviceName?.trim();
    if (!name || name.length > 80) {
      return NextResponse.json({ error: "Invalid device name" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: existing } = await admin
      .from("trusted_devices")
      .select("id, user_id, organization_id")
      .eq("id", id)
      .maybeSingle();

    const row = existing as {
      id: string;
      user_id: string;
      organization_id: string;
    } | null;

    if (!row || row.user_id !== user.id || row.organization_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data, error } = await admin
      .from("trusted_devices")
      .update({ device_name: name } as never)
      .eq("id", id)
      .select("id, device_name")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, device: data });
  } catch (err) {
    console.error("[devices/rename] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
