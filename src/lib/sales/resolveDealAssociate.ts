import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeDealAssociate } from "@/lib/sales/dealAssociate";

/** Turn drawer value (l:lead / c:contact) into DB columns for deals. */
export async function resolveDealAssociate(
  admin: SupabaseClient,
  orgId: string,
  associate: string | null | undefined
): Promise<{ contact_id: string | null; sales_lead_id: string | null }> {
  if (associate == null || String(associate).trim() === "") {
    return { contact_id: null, sales_lead_id: null };
  }
  const d = decodeDealAssociate(String(associate).trim());
  if (d.contact_id) {
    return { contact_id: d.contact_id, sales_lead_id: null };
  }
  if (!d.sales_lead_id) {
    return { contact_id: null, sales_lead_id: null };
  }
  const { data: lead, error } = await admin
    .from("sales_leads")
    .select("id, converted_contact_id, organization_id")
    .eq("id", d.sales_lead_id)
    .single();

  if (error || !lead) {
    throw new Error("Lead not found");
  }
  const row = lead as { id: string; converted_contact_id: string | null; organization_id: string };
  if (row.organization_id !== orgId) {
    throw new Error("Forbidden");
  }
  if (row.converted_contact_id) {
    return { contact_id: row.converted_contact_id, sales_lead_id: null };
  }
  return { contact_id: null, sales_lead_id: row.id };
}
