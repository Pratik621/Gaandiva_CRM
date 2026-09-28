-- Multiple client logos for client_viewer / DC header (side-by-side).
-- Keeps logo_url as the primary (first) logo for backward-compatible readers.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_urls text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.clients.logo_urls IS
  'Client logo URLs (Supabase Storage); shown side-by-side on client viewer / DC dashboard header';

-- Backfill from legacy single logo_url without wiping any already-set arrays.
UPDATE public.clients
SET logo_urls = ARRAY[logo_url]
WHERE logo_url IS NOT NULL
  AND btrim(logo_url) <> ''
  AND (logo_urls IS NULL OR cardinality(logo_urls) = 0);
