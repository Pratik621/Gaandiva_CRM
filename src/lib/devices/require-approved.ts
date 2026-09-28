import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { NextResponse } from "next/server";
import { readDeviceTokenFromRequest } from "@/lib/devices/cookie";
import { hashDeviceToken } from "@/lib/devices/token";
import { getOrgDeviceSettings, isDeviceEnforcementActive } from "@/lib/devices/settings";

type AnyClient = SupabaseClient<Database>;

/**
 * For sensitive API routes: require an approved device when enforcement is on.
 * Returns null if OK, or a NextResponse error.
 */
export async function requireApprovedDevice(
  request: NextRequest,
  client: AnyClient,
  userId: string,
  organizationId: string
): Promise<NextResponse | null> {
  const settings = await getOrgDeviceSettings(client, organizationId);
  if (!isDeviceEnforcementActive(settings)) return null;

  const token = readDeviceTokenFromRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Device not registered", code: "DEVICE_REQUIRED" },
      { status: 403 }
    );
  }

  const tokenHash = hashDeviceToken(token);
  const { data } = await client
    .from("trusted_devices")
    .select("id, status")
    .eq("user_id", userId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const row = data as { id: string; status: string } | null;
  if (!row || row.status !== "approved") {
    return NextResponse.json(
      {
        error: row?.status === "revoked" ? "Device revoked" : "Device pending approval",
        code: row?.status === "revoked" ? "DEVICE_REVOKED" : "DEVICE_PENDING",
      },
      { status: 403 }
    );
  }

  return null;
}
