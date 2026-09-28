import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchSalesLeadIfAccessible(
  admin: SupabaseClient,
  orgId: string,
  leadId: string,
  opts: { userId: string; isManagerOrAdmin: boolean }
): Promise<Record<string, unknown> | null> {
  let q = admin
    .from("sales_leads")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", leadId);

  if (!opts.isManagerOrAdmin) {
    q = q.or(`assigned_agent_id.eq.${opts.userId},created_by.eq.${opts.userId}`);
  }

  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}
