-- Lead aggregate label for campaign reporting / dashboard (matches app form field `lead_aggregated`).

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS lead_aggregated text;

COMMENT ON COLUMN public.campaigns.lead_aggregated IS
  'Lead aggregate source or label (e.g. partner / list name) for campaign header and reporting.';
