import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export const DC_CLIENT_NAME = "DC";

type CampRow = {
  id: string;
  client_name: string | null;
  client_id: string | null;
};

export async function verifyDcRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name")
    .eq("organization_id", orgId);
  const dcRoles = ((roles ?? []) as { id: string; name: string | null }[]).filter(
    (r) => r.name?.toLowerCase() === "dc"
  );
  if (dcRoles.length === 0) return false;
  const { data: ur } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .in("role_id", dcRoles.map((r) => r.id));
  return (ur ?? []).length > 0;
}

export function isDcCampaign(
  campaign: CampRow,
  clientNameById: Record<string, string>
): boolean {
  const direct =
    (campaign.client_name ?? "").trim().toLowerCase() === DC_CLIENT_NAME.toLowerCase();
  const viaClient = campaign.client_id
    ? (clientNameById[campaign.client_id] ?? "").trim().toLowerCase() ===
      DC_CLIENT_NAME.toLowerCase()
    : false;
  return direct || viaClient;
}

export async function getDcCampaignIdSet(
  admin: SupabaseClient<Database>,
  orgId: string
): Promise<Set<string>> {
  const { data: allCamps } = await admin
    .from("campaigns")
    .select("id, client_name, client_id")
    .eq("organization_id", orgId);

  const camps = (allCamps ?? []) as CampRow[];
  const clientIds = [...new Set(camps.map((c) => c.client_id).filter(Boolean))] as string[];
  const clientNameById: Record<string, string> = {};

  if (clientIds.length > 0) {
    const { data: clients } = await admin
      .from("clients")
      .select("id, company_name")
      .in("id", clientIds);
    ((clients ?? []) as { id: string; company_name: string }[]).forEach((cl) => {
      clientNameById[cl.id] = cl.company_name;
    });
  }

  return new Set(
    camps.filter((c) => isDcCampaign(c, clientNameById)).map((c) => c.id)
  );
}

export async function isLeadInDcScope(
  admin: SupabaseClient<Database>,
  orgId: string,
  leadId: string
): Promise<boolean> {
  const { data: lead } = await admin
    .from("leads")
    .select("id, campaign_id, organization_id")
    .eq("id", leadId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!lead) return false;
  const campaignId = (lead as { campaign_id: string }).campaign_id;
  const dcCampaignIds = await getDcCampaignIdSet(admin, orgId);
  return dcCampaignIds.has(campaignId);
}
