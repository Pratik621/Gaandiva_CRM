import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClientSafe } from "@/lib/supabase/admin";

/** Resolve display labels for user ids (full_name, else email). */
export async function resolveUserDisplayNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const admin = getAdminClientSafe();
  const db = admin ?? supabase;
  const { data, error } = await db
    .from("users")
    .select("id, full_name, email")
    .in("id", uniqueIds);

  if (error) {
    console.error("resolveUserDisplayNames:", error.message);
    return {};
  }

  const names: Record<string, string> = {};
  for (const row of data ?? []) {
    const u = row as { id: string; full_name: string | null; email: string | null };
    const label = (u.full_name ?? "").trim() || (u.email ?? "").trim();
    if (label) names[u.id] = label;
  }
  return names;
}
