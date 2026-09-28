import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadActivityType =
  | "call"
  | "meeting"
  | "email"
  | "demo"
  | "note"
  | "lifecycle_change"
  | "system"
  | "task";

export async function insertLeadActivity(
  admin: SupabaseClient,
  input: {
    activity_type: LeadActivityType;
    related_to_id: string;
    notes: string | null;
    activity_date?: string;
    owner_id: string;
  }
): Promise<void> {
  const { error } = await admin.from("activities").insert({
    activity_type: input.activity_type,
    related_to_type: "lead",
    related_to_id: input.related_to_id,
    notes: input.notes,
    activity_date: input.activity_date ?? new Date().toISOString(),
    owner_id: input.owner_id,
  } as never);

  if (error) {
    console.error("[insertLeadActivity]", error.message);
  }
}
