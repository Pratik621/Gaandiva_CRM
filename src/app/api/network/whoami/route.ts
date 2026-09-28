import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Phase-0 diagnostic for the office-network allowlist: shows exactly which
 * client IP the app sees on Vercel. Open this from the office network to
 * capture the office egress IP before configuring office_networks.
 * Authenticated users only — reveals nothing beyond the caller's own IP.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forwarded = request.headers.get("x-forwarded-for");
  // First x-forwarded-for entry — Vercel sets this to the real client IP and
  // strips spoofed inbound values. Same derivation as lib/mfa/audit.ts.
  const clientIp = forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;

  return NextResponse.json({
    client_ip: clientIp,
    headers: {
      "x-forwarded-for": forwarded,
      "x-real-ip": request.headers.get("x-real-ip"),
      "x-vercel-forwarded-for": request.headers.get("x-vercel-forwarded-for"),
      "x-vercel-ip-country": request.headers.get("x-vercel-ip-country"),
      "x-vercel-ip-city": request.headers.get("x-vercel-ip-city"),
    },
    note: "client_ip is what the allowlist will compare against. Open this from the office network and note the value.",
  });
}
