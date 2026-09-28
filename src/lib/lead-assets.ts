import type { SupabaseClient } from "@supabase/supabase-js";

export const VOICE_BUCKET = "campaign-files";
export const MAX_VOICE_RECORDINGS_PER_LEAD = 4;

export type VoiceRecording = {
  id: string;
  name: string;
  path: string;
  url: string | null;
  size: number | null;
  created_at: string | null;
};

export type LeadAssetType = "voice" | "lho";

export type LeadAssetRow = {
  id: string;
  organization_id: string;
  campaign_id: string;
  lead_id: string;
  asset_type: LeadAssetType;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type LeadAssetInsert = {
  organization_id: string;
  campaign_id: string;
  lead_id: string;
  asset_type: LeadAssetType;
  file_name: string;
  file_path: string;
  file_size?: number | null;
  mime_type?: string | null;
  uploaded_by?: string | null;
  created_at?: string;
};

type DbClient = Pick<SupabaseClient, "from">;
type StorageClient = Pick<SupabaseClient, "storage">;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Minimum path depth for Storage.list — org/campaign/lead (never bucket or campaign root). */
const MIN_LIST_PREFIX_SEGMENTS = 3;

/**
 * Legacy Storage.list path for voice/LHO when lead_assets has no row.
 * Off by default — each list() call hits storage.search and burns Disk IO.
 * Set ENABLE_STORAGE_LIST_FALLBACK=true only for one-off backfill/debug.
 */
export function isStorageListFallbackEnabled(): boolean {
  return process.env.ENABLE_STORAGE_LIST_FALLBACK === "true";
}

/** Reject broad prefixes (bucket root, org-only, org/campaign) before any Storage.list. */
export function assertLeadLevelListPrefix(prefix: string): void {
  const segments = prefix.split("/").filter(Boolean);
  if (segments.length < MIN_LIST_PREFIX_SEGMENTS) {
    throw new Error(
      `Storage.list blocked: prefix must be org/campaign/lead or deeper, got "${prefix}"`
    );
  }
}

export function leadVoiceStoragePrefix(
  orgId: string,
  campaignId: string,
  leadId: string
): string {
  return `${orgId}/${campaignId}/${leadId}`;
}

export function leadLhoStoragePrefix(
  orgId: string,
  campaignId: string,
  leadId: string
): string {
  return `${orgId}/${campaignId}/${leadId}/lho`;
}

export function assetRowToVoiceRecording(
  row: Pick<LeadAssetRow, "file_name" | "file_path" | "file_size" | "created_at">,
  url: string | null
): VoiceRecording {
  return {
    name: row.file_name,
    id: row.file_path,
    path: row.file_path,
    size: row.file_size,
    created_at: row.created_at,
    url,
  };
}

export async function insertLeadAsset(
  db: DbClient,
  asset: LeadAssetInsert
): Promise<{ error: string | null }> {
  const { error } = await db.from("lead_assets").upsert(
    {
      organization_id: asset.organization_id,
      campaign_id: asset.campaign_id,
      lead_id: asset.lead_id,
      asset_type: asset.asset_type,
      file_name: asset.file_name,
      file_path: asset.file_path,
      file_size: asset.file_size ?? null,
      mime_type: asset.mime_type ?? null,
      uploaded_by: asset.uploaded_by ?? null,
      created_at: asset.created_at ?? new Date().toISOString(),
    },
    { onConflict: "file_path", ignoreDuplicates: true }
  );

  if (error) {
    console.error("insertLeadAsset:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteLeadAssetByPath(
  db: DbClient,
  orgId: string,
  filePath: string
): Promise<{ error: string | null }> {
  const { error } = await db
    .from("lead_assets")
    .delete()
    .eq("organization_id", orgId)
    .eq("file_path", filePath);

  if (error) {
    console.error("deleteLeadAssetByPath:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function countLeadAssets(
  db: DbClient,
  orgId: string,
  leadId: string,
  assetType: LeadAssetType
): Promise<number> {
  const { count, error } = await db
    .from("lead_assets")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("lead_id", leadId)
    .eq("asset_type", assetType);

  if (error) {
    console.error("countLeadAssets:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function fetchLeadAssetsByLeadIds(
  db: DbClient,
  orgId: string,
  leadIds: string[],
  assetType: LeadAssetType
): Promise<LeadAssetRow[]> {
  if (leadIds.length === 0) return [];

  const CHUNK = 100;
  const all: LeadAssetRow[] = [];
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const slice = leadIds.slice(i, i + CHUNK);
    const { data, error } = await db
      .from("lead_assets")
      .select(
        "id, organization_id, campaign_id, lead_id, asset_type, file_name, file_path, file_size, mime_type, uploaded_by, created_at"
      )
      .eq("organization_id", orgId)
      .eq("asset_type", assetType)
      .in("lead_id", slice)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchLeadAssetsByLeadIds:", error.message);
      continue;
    }
    all.push(...((data ?? []) as LeadAssetRow[]));
  }
  return all;
}

export async function fetchLeadAssetsByCampaign(
  db: DbClient,
  orgId: string,
  campaignId: string,
  assetType: LeadAssetType
): Promise<LeadAssetRow[]> {
  const PAGE = 1000;
  const all: LeadAssetRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await db
      .from("lead_assets")
      .select(
        "id, organization_id, campaign_id, lead_id, asset_type, file_name, file_path, file_size, mime_type, uploaded_by, created_at"
      )
      .eq("organization_id", orgId)
      .eq("campaign_id", campaignId)
      .eq("asset_type", assetType)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error("fetchLeadAssetsByCampaign:", error.message);
      return all;
    }

    const chunk = (data ?? []) as LeadAssetRow[];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  return all;
}

/** Storage createSignedUrls stays reliable with smaller batches. */
const SIGNED_URL_BATCH = 50;

export async function createSignedUrlMap(
  storageClient: StorageClient,
  paths: string[],
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS
): Promise<Map<string, string | null>> {
  const urlByPath = new Map<string, string | null>();
  if (paths.length === 0) return urlByPath;

  for (let i = 0; i < paths.length; i += SIGNED_URL_BATCH) {
    const batch = paths.slice(i, i + SIGNED_URL_BATCH);
    try {
      const { data: signed, error: signError } = await storageClient.storage
        .from(VOICE_BUCKET)
        .createSignedUrls(batch, ttlSeconds);

      if (signError) {
        console.error("createSignedUrlMap:", signError.message, `(batch ${i}-${i + batch.length})`);
        for (const path of batch) {
          if (!urlByPath.has(path)) urlByPath.set(path, null);
        }
        continue;
      }
      for (const s of signed ?? []) {
        if (s.path) {
          urlByPath.set(s.path, s.error ? null : s.signedUrl ?? null);
        }
      }
    } catch (err) {
      console.error("createSignedUrlMap threw:", err, `(batch ${i}-${i + batch.length})`);
      for (const path of batch) {
        if (!urlByPath.has(path)) urlByPath.set(path, null);
      }
    }
  }
  return urlByPath;
}

/** Storage.list fallback for one lead folder only (never campaign/bucket root). */
export async function listVoiceFromStorageFallback(
  storageClient: StorageClient,
  orgId: string,
  campaignId: string,
  leadId: string
): Promise<VoiceRecording[]> {
  if (!isStorageListFallbackEnabled()) return [];

  const prefix = leadVoiceStoragePrefix(orgId, campaignId, leadId);
  assertLeadLevelListPrefix(prefix);

  const { data: files, error: listError } = await storageClient.storage
    .from(VOICE_BUCKET)
    .list(prefix, {
      limit: MAX_VOICE_RECORDINGS_PER_LEAD,
    });

  if (listError) {
    console.error("listVoiceFromStorageFallback:", listError.message);
    return [];
  }

  const entries = (files ?? []).filter((f) => f.name && f.name !== "lho");
  const paths = entries.map((f) => `${prefix}/${f.name}`);
  const urlByPath = await createSignedUrlMap(storageClient, paths);

  return entries.map((f) => {
    const objectPath = `${prefix}/${f.name}`;
    return {
      name: f.name,
      id: objectPath,
      path: objectPath,
      size: (f as { size?: number }).size ?? null,
      created_at: (f as { created_at?: string }).created_at ?? null,
      url: urlByPath.get(objectPath) ?? null,
    };
  });
}

export async function listLhoFromStorageFallback(
  storageClient: StorageClient,
  orgId: string,
  campaignId: string,
  leadId: string
): Promise<VoiceRecording[]> {
  if (!isStorageListFallbackEnabled()) return [];

  const prefix = leadLhoStoragePrefix(orgId, campaignId, leadId);
  assertLeadLevelListPrefix(prefix);

  const { data: files, error: listError } = await storageClient.storage
    .from(VOICE_BUCKET)
    .list(prefix, {
      limit: 20,
    });

  if (listError) {
    console.error("listLhoFromStorageFallback:", listError.message);
    return [];
  }

  const entries = (files ?? []).filter((f) => !!f.name);
  const paths = entries.map((f) => `${prefix}/${f.name}`);
  const urlByPath = await createSignedUrlMap(storageClient, paths);

  return entries.map((f) => {
    const objectPath = `${prefix}/${f.name}`;
    return {
      name: f.name,
      id: objectPath,
      path: objectPath,
      size: (f as { size?: number }).size ?? null,
      created_at: (f as { created_at?: string }).created_at ?? null,
      url: urlByPath.get(objectPath) ?? null,
    };
  });
}

/**
 * Batch-list voice recordings for many leads from lead_assets.
 * Leads with zero DB rows return [] unless ENABLE_STORAGE_LIST_FALLBACK=true.
 */
export async function listVoiceRecordingsForLeads(
  db: DbClient,
  storageClient: StorageClient,
  orgId: string,
  leads: { id: string; campaign_id: string; organization_id: string }[]
): Promise<Record<string, VoiceRecording[]>> {
  const recordings: Record<string, VoiceRecording[]> = {};
  for (const lead of leads) {
    recordings[lead.id] = [];
  }
  if (leads.length === 0) return recordings;

  const leadIds = leads.map((l) => l.id);
  const rows = await fetchLeadAssetsByLeadIds(db, orgId, leadIds, "voice");
  const byLead = new Map<string, LeadAssetRow[]>();
  for (const row of rows) {
    const list = byLead.get(row.lead_id) ?? [];
    list.push(row);
    byLead.set(row.lead_id, list);
  }

  const dbPaths: string[] = [];
  for (const lead of leads) {
    const leadRows = byLead.get(lead.id) ?? [];
    for (const row of leadRows) {
      dbPaths.push(row.file_path);
    }
  }
  const urlByPath = await createSignedUrlMap(storageClient, dbPaths);

  const missing: typeof leads = [];
  for (const lead of leads) {
    const leadRows = byLead.get(lead.id) ?? [];
    if (leadRows.length === 0) {
      missing.push(lead);
      continue;
    }
    recordings[lead.id] = leadRows.map((row) =>
      assetRowToVoiceRecording(row, urlByPath.get(row.file_path) ?? null)
    );
  }

  if (missing.length > 0 && isStorageListFallbackEnabled()) {
    const fallbacks = await Promise.all(
      missing.map(async (lead) => ({
        leadId: lead.id,
        files: await listVoiceFromStorageFallback(
          storageClient,
          orgId,
          lead.campaign_id,
          lead.id
        ),
      }))
    );
    for (const entry of fallbacks) {
      recordings[entry.leadId] = entry.files;
    }
  }

  return recordings;
}

export async function listLhoFilesForLead(
  db: DbClient,
  storageClient: StorageClient,
  orgId: string,
  lead: { id: string; campaign_id: string }
): Promise<VoiceRecording[]> {
  const rows = await fetchLeadAssetsByLeadIds(db, orgId, [lead.id], "lho");
  if (rows.length === 0) {
    if (!isStorageListFallbackEnabled()) return [];
    return listLhoFromStorageFallback(storageClient, orgId, lead.campaign_id, lead.id);
  }
  const urlByPath = await createSignedUrlMap(
    storageClient,
    rows.map((r) => r.file_path)
  );
  return rows.map((row) =>
    assetRowToVoiceRecording(row, urlByPath.get(row.file_path) ?? null)
  );
}
