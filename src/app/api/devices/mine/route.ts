import { NextResponse, type NextRequest } from "next/server";
import { getDeviceApiUser } from "@/lib/devices/api-auth";
import { readDeviceTokenFromRequest, lookupDeviceByToken } from "@/lib/devices";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getDeviceApiUser();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { supabase, user } = ctx as Exclude<
      Awaited<ReturnType<typeof getDeviceApiUser>>,
      { error: NextResponse }
    >;

    const { data, error } = await supabase
      .from("trusted_devices")
      .select(
        "id, device_name, browser, os, location_approx, status, last_seen_at, created_at, approved_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let currentId: string | null = null;
    const token = readDeviceTokenFromRequest(request);
    if (token) {
      const current = await lookupDeviceByToken(supabase, user.id, token);
      currentId = current?.id ?? null;
    }

    const devices = ((data ?? []) as Array<{
      id: string;
      device_name: string;
      browser: string | null;
      os: string | null;
      location_approx: string | null;
      status: string;
      last_seen_at: string | null;
      created_at: string;
      approved_at: string | null;
    }>).map((d) => ({
      ...d,
      is_current: d.id === currentId,
    }));

    return NextResponse.json({ devices });
  } catch (err) {
    console.error("[devices/mine] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
