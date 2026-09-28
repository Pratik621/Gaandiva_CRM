import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type AnyClient = SupabaseClient<Database>;

/**
 * First device of the first org admin auto-approves so someone can approve others.
 * True when: user is admin AND org has zero approved devices.
 */
export async function shouldBootstrapAutoApprove(
  client: AnyClient,
  args: { organizationId: string; userId: string; isAdmin: boolean }
): Promise<boolean> {
  if (!args.isAdmin) return false;

  const { count } = await client
    .from("trusted_devices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", args.organizationId)
    .eq("status", "approved");

  return (count ?? 0) === 0;
}
