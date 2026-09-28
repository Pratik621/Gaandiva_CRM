import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { authDebug } from "@/lib/auth/debug";

export function createMiddlewareSupabaseClient(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { supabase: null, getResponse: () => response };
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  return { supabase, getResponse: () => response };
}

export async function updateSession(request: NextRequest) {
  const { supabase, getResponse } = createMiddlewareSupabaseClient(request);
  if (!supabase) {
    return getResponse();
  }

  // Refresh session - updates cookies if expired
  try {
    await supabase.auth.getUser();
    authDebug("middleware", "session refreshed");
  } catch (err) {
    // e.g. ConnectTimeoutError when Supabase is unreachable (network, paused project, firewall)
    console.warn("[middleware] Supabase session refresh failed:", (err as Error)?.message ?? err);
  }

  return getResponse();
}
