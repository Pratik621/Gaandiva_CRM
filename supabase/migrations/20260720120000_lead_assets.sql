-- Lead voice/LHO asset catalog (paths only — Storage objects stay untouched).
-- Listing reads this table instead of N+1 storage.list / storage.search calls.

CREATE TABLE IF NOT EXISTS public.lead_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_assets_asset_type_check CHECK (asset_type = ANY (ARRAY['voice'::text, 'lho'::text])),
  CONSTRAINT lead_assets_file_path_unique UNIQUE (file_path)
);

CREATE INDEX IF NOT EXISTS idx_lead_assets_org_lead
  ON public.lead_assets (organization_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_assets_org_campaign_type
  ON public.lead_assets (organization_id, campaign_id, asset_type);

CREATE INDEX IF NOT EXISTS idx_lead_assets_lead_type_created
  ON public.lead_assets (lead_id, asset_type, created_at DESC);

ALTER TABLE public.lead_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_assets_select_org ON public.lead_assets;
CREATE POLICY lead_assets_select_org
  ON public.lead_assets FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.get_my_organization_id()));

DROP POLICY IF EXISTS lead_assets_insert_org ON public.lead_assets;
CREATE POLICY lead_assets_insert_org
  ON public.lead_assets FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.get_my_organization_id()));

DROP POLICY IF EXISTS lead_assets_delete_org ON public.lead_assets;
CREATE POLICY lead_assets_delete_org
  ON public.lead_assets FOR DELETE TO authenticated
  USING (organization_id = (SELECT public.get_my_organization_id()));

COMMENT ON TABLE public.lead_assets IS
  'Catalog of lead voice recordings and LHO files in campaign-files Storage. Binary files remain in Storage; this table is for fast listing only.';
