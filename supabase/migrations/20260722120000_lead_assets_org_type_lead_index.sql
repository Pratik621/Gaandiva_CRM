-- Speed up batch voice/LHO lookups: org + asset_type + lead_id IN (...).
CREATE INDEX IF NOT EXISTS idx_lead_assets_org_type_lead
  ON public.lead_assets (organization_id, asset_type, lead_id);
