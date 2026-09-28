-- Add targeting and creatives fields to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS employee_size text[],
  ADD COLUMN IF NOT EXISTS abm boolean,
  ADD COLUMN IF NOT EXISTS seniority text,
  ADD COLUMN IF NOT EXISTS job_function text,
  ADD COLUMN IF NOT EXISTS creatives_url text[];

COMMENT ON COLUMN public.campaigns.employee_size IS 'Target employee size ranges (2-11, 11-50, etc.)';
COMMENT ON COLUMN public.campaigns.abm IS 'Account-Based Marketing (Yes/No)';
COMMENT ON COLUMN public.campaigns.creatives_url IS 'Array of creatives/asset URLs';
