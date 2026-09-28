import { NextResponse } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { expireStaleDevices } from "@/lib/devices";

export const dynamic = "force-dynamic";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Allow in non-production for local testing without secret
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const header = request.headers.get("x-cron-secret");
  return header === secret;
}

async function runExpire() {
  const admin = getAdminClientSafe();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const expired = await expireStaleDevices(admin);
  return NextResponse.json({ ok: true, expired });
}

export async function GET(request: Request) {
  try {
    if (!authorizeCron(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await runExpire();
  } catch (err) {
    console.error("[cron/expire-devices] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
