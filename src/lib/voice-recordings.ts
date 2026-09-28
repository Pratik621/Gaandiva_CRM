import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import {
  listVoiceRecordingsForLeads,
  MAX_VOICE_RECORDINGS_PER_LEAD,
  VOICE_BUCKET,
  type VoiceRecording,
} from "@/lib/lead-assets";

export { VOICE_BUCKET, MAX_VOICE_RECORDINGS_PER_LEAD, type VoiceRecording };

/** Roles that may list/upload lead voice recordings without agent campaign assignment. */
export const PRIVILEGED_VOICE_ROLES = new Set([
  "team_leader",
  "tl",
  "operations_manager",
  "qa",
  "mis",
  "admin",
  "sales",
  "dc",
]);

type DbClient = Pick<SupabaseClient, "from" | "storage">;

function leadRowId(lead: unknown): string | null {
  const id = (lead as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function leadCampaignId(lead: unknown): string | null {
  const id = (lead as { campaign_id?: unknown }).campaign_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function attachVoiceRecordingsToLeads<T>(
  storageClient: DbClient,
  orgId: string,
  campaignId: string,
  leads: T[]
): Promise<(T & { voice_recordings: VoiceRecording[] })[]> {
  if (leads.length === 0) return [];

  const leadRefs = leads
    .map((lead) => {
      const id = leadRowId(lead);
      const cid = leadCampaignId(lead) ?? campaignId;
      if (!id) return null;
      return { id, campaign_id: cid, organization_id: orgId };
    })
    .filter((l): l is { id: string; campaign_id: string; organization_id: string } => !!l);

  const byLead = await listVoiceRecordingsForLeads(
    storageClient,
    storageClient,
    orgId,
    leadRefs
  );

  return leads.map((lead) => {
    const id = leadRowId(lead);
    return {
      ...lead,
      voice_recordings: id ? byLead[id] ?? [] : [],
    };
  });
}

/** Attach voice recordings when admin storage is available; otherwise empty arrays. */
export async function enrichCampaignLeadsWithVoiceRecordings<T>(
  orgId: string,
  campaignId: string,
  leads: T[]
): Promise<(T & { voice_recordings: VoiceRecording[] })[]> {
  const admin = getAdminClientSafe();
  if (!admin) {
    return leads.map((lead) => ({ ...lead, voice_recordings: [] }));
  }
  return attachVoiceRecordingsToLeads(admin, orgId, campaignId, leads);
}
