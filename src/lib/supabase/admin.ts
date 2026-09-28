import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type AdminClient = ReturnType<typeof createClient<Database>>;

/**
 * Server-only Supabase client with service role.
 * Use ONLY in API routes / Server Actions - never expose to client.
 * @throws when SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing
 */
export function createAdminClient(): AdminClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for admin operations");
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Message returned when admin client cannot be created (missing env). */
export const ADMIN_NOT_CONFIGURED_MESSAGE =
  "Admin API not configured. Set SUPABASE_SERVICE_ROLE_KEY in deployment environment.";

/**
 * Returns admin client or null if env vars are missing. Use in API routes
 * to return 503 instead of 500 when SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function getAdminClientSafe(): AdminClient | null {
  try {
    return createAdminClient();
  } catch (err) {
    console.error("Admin client init failed (missing SUPABASE_SERVICE_ROLE_KEY?):", err);
    return null;
  }
}
