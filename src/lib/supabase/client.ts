import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(
        "Supabase client not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    console.error(
      "[Supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. Authentication will not work."
    );
    throw new Error("Authentication service is temporarily unavailable. Please contact the administrator.");
  }

  client = createBrowserClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Disable navigator.locks-based storage serialization.
      // @supabase/auth-js v2.64+ acquires an exclusive NavigatorLock for every
      // getSession / getUser / signIn call. With cookie-based sessions (@supabase/ssr)
      // the middleware handles token refresh server-side, so the browser client
      // does not need lock-serialized localStorage access. Without this, concurrent
      // calls during login queue on the same exclusive lock and the 10 000 ms
      // timeout fires.
      lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
    },
  });
  return client;
}

/**
 * Destroy the module-level singleton so the next createClient() call
 * returns a fresh instance with no in-memory session cache.
 * Must be called on sign-out BEFORE window.location.replace so the
 * login page's init() doesn't read a stale session from the old instance.
 */
export function resetClient() {
  client = null;
}
