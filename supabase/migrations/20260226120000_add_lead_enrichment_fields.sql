-- Add enrichment fields to leads for Add Lead form
-- New fields:
-- - Job Title
-- - Job Function
-- - Job Level
-- - Direct Number
-- - Industry
-- - Company Number
-- - Employee Size
-- - Address
-- - State
-- - Country
-- - Zip Code / Postal Code
-- - Founded Years
-- - Founded Years Link
-- - Revenue Range
-- - Revenue Link
-- - Contact LinkedIn URL
-- - Company LinkedIn URL
-- - Lead Disposition

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS job_title text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS job_function text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS job_level text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS direct_number text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS industry text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_number text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS employee_size text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS state text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS country text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS zip_code text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS founded_years integer;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS founded_years_link text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS revenue_range text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS revenue_link text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_linkedin_url text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_linkedin_url text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_disposition text;

