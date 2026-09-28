-- Re-run idempotent lead_assets catalog backfill from storage.objects metadata only.
-- READ-ONLY for Storage binaries: no upload, move, rename, or delete of objects.
-- Only inserts missing rows into public.lead_assets (ON CONFLICT DO NOTHING).

WITH parsed AS (
  SELECT
    o.name AS file_path,
    o.created_at,
    NULLIF(o.metadata->>'size', '')::bigint AS file_size,
    COALESCE(o.metadata->>'mimetype', o.metadata->>'contentType') AS mime_type,
    string_to_array(o.name, '/') AS parts
  FROM storage.objects o
  WHERE o.bucket_id = 'campaign-files'
    AND o.name IS NOT NULL
    AND o.name !~ '/$'
),
classified AS (
  SELECT
    parts[1]::uuid AS organization_id,
    parts[2]::uuid AS campaign_id,
    parts[3]::uuid AS lead_id,
    CASE
      WHEN cardinality(parts) = 5 AND parts[4] = 'lho' THEN 'lho'
      WHEN cardinality(parts) = 4 THEN 'voice'
      ELSE NULL
    END AS asset_type,
    CASE
      WHEN cardinality(parts) = 5 AND parts[4] = 'lho' THEN parts[5]
      WHEN cardinality(parts) = 4 THEN parts[4]
      ELSE NULL
    END AS file_name,
    file_path,
    file_size,
    mime_type,
    created_at
  FROM parsed
  WHERE cardinality(parts) IN (4, 5)
    AND parts[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND parts[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND parts[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
INSERT INTO public.lead_assets (
  organization_id,
  campaign_id,
  lead_id,
  asset_type,
  file_name,
  file_path,
  file_size,
  mime_type,
  created_at
)
SELECT
  c.organization_id,
  c.campaign_id,
  c.lead_id,
  c.asset_type,
  c.file_name,
  c.file_path,
  c.file_size,
  c.mime_type,
  COALESCE(c.created_at, now())
FROM classified c
JOIN public.leads l ON l.id = c.lead_id AND l.organization_id = c.organization_id
WHERE c.asset_type IS NOT NULL
  AND c.file_name IS NOT NULL
  AND c.file_name <> ''
  AND c.file_name <> '.emptyFolderPlaceholder'
ON CONFLICT (file_path) DO NOTHING;
