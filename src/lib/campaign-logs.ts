import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClientSafe } from "@/lib/supabase/admin";

export interface CampaignLogPayload {
  campaign_id: string;
  action: string;
  message: string;
  created_by: string;
}
export async function createCampaignLog(
  supabase: SupabaseClient,
  payload: CampaignLogPayload
): Promise<void> {
  const client = getAdminClientSafe() ?? supabase;
  const { error } = await client
    .from("campaign_logs")
    .insert(payload as never);
  if (error) {
    console.error("[campaign-logs] insert error:", error.message, "| payload:", JSON.stringify(payload));
  }
}
