import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only client for the separate Call Logs Supabase project.
 * Auth/leads/campaigns stay on the main project; this DB only stores call logs.
 * Use ONLY in API routes / Server Actions - never import from client components.
 */
let client: SupabaseClient | null = null;

export function createCallLogsClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.CALLLOGS_SUPABASE_URL;
  const key =
    process.env.CALLLOGS_SUPABASE_SECRET_KEY || process.env.CALLLOGS_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Missing CALLLOGS_SUPABASE_URL / CALLLOGS_SUPABASE_SECRET_KEY for call logs DB");
  }

  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export const CALL_LOGS_NOT_CONFIGURED_MESSAGE =
  "Call logs DB not configured. Set CALLLOGS_SUPABASE_URL and CALLLOGS_SUPABASE_SECRET_KEY.";

/** Returns the call logs client or null if env vars are missing (API routes return 503). */
export function getCallLogsClientSafe(): SupabaseClient | null {
  try {
    return createCallLogsClient();
  } catch (err) {
    console.error("Call logs client init failed:", err);
    return null;
  }
}
