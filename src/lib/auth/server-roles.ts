import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRoleName } from "@/lib/auth/config";

export async function fetchUserRoleNames(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);

  const names: string[] = [];
  for (const row of roleRows ?? []) {
    const roles = (row as { roles: { name?: string } | { name?: string }[] | null }).roles;
    if (!roles) continue;
    if (Array.isArray(roles)) {
      for (const role of roles) {
        const normalized = normalizeRoleName(role?.name);
        if (normalized) names.push(normalized);
      }
    } else {
      const normalized = normalizeRoleName(roles.name);
      if (normalized) names.push(normalized);
    }
  }
  return names;
}
