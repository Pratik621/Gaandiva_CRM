import type { SupabaseClient } from "@supabase/supabase-js";

export interface ImportLeadRow {
  name: string;
  phone: string;
  email: string;
  property: string;
  notes: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  error: string | null;
}

export async function insertImportedLeads(
  supabase: SupabaseClient,
  params: { organizationId: string; campaignId: string; userId: string; rows: ImportLeadRow[] }
): Promise<ImportResult> {
  const valid = params.rows.filter((r) => r.name || r.phone || r.email);
  const skipped = params.rows.length - valid.length;

  if (valid.length === 0) {
    return { created: 0, skipped, error: "No valid rows found (need at least a name, phone, or email column)" };
  }

  const inserts = valid.map((r) => ({
    organization_id: params.organizationId,
    simplified_campaign_id: params.campaignId,
    name: r.name || null,
    phone: r.phone || null,
    email: r.email || null,
    raw_data: r.property ? { "Property Count": r.property } : {},
    call_form_response: r.notes ? { notes: r.notes } : null,
    status: "new",
    created_by: params.userId,
  }));

  const { data, error } = await supabase
    .from("simplified_leads")
    .insert(inserts as never)
    .select("id");

  if (error) {
    return { created: 0, skipped, error: error.message };
  }

  return { created: data?.length ?? 0, skipped, error: null };
}
