import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { clearMfaSessionCookie } from "@/lib/mfa/session-cookie";
import { clearAllDeviceCookies } from "@/lib/devices/cookie";
import { cookies } from "next/headers";
import { logAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

function clearedSupabaseCookieOptions() {
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    ...(domain ? { domain } : {}),
  };
}

export async function POST(request: Request) {
  // Invalidate the session on Supabase's server (invalidates the refresh token).
  // The @supabase/ssr server client's setAll callback writes the cleared session
  // cookies back to the Route Handler response automatically.
  try {
    const supabase = await createClient();

    // Audit: capture who is logging out before the session dies.
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("organization_id, full_name, email")
          .eq("id", user.id)
          .single();
        const p = profile as {
          organization_id: string | null;
          full_name: string | null;
          email: string | null;
        } | null;
        if (p?.organization_id) {
          void logAudit({
            organizationId: p.organization_id,
            actorId: user.id,
            category: "auth",
            eventType: "logout",
            description: `${p.full_name || p.email || "User"} signed out`,
            request,
          });
        }
      }
    } catch {
      // Audit is best-effort — never block sign-out.
    }

    await supabase.auth.signOut();
  } catch (err) {
    console.error("Server signOut failed:", err);
  }

  // Belt-and-suspenders: explicitly clear any remaining Supabase cookies by
  // name so the browser discards them even if the SSR setAll path missed any.
  const response = NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );

  clearMfaSessionCookie(response);
  clearAllDeviceCookies(response);

  const clearOpts = clearedSupabaseCookieOptions();

  try {
    const cookieStore = await cookies();
    for (const cookie of cookieStore.getAll()) {
      if (cookie.name.startsWith("sb-") || cookie.name.includes("supabase")) {
        response.cookies.set(cookie.name, "", clearOpts);
      }
    }
  } catch {
    // Non-fatal — the supabase.auth.signOut() above is the primary mechanism.
  }

  return response;
}
