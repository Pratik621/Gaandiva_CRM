-- Additive nullable columns for client export/import template (zero-downtime).
-- No drops, renames, or backfills — existing lead data unchanged.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS address2 text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS address_link text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS actual_employee_size text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS industry_type_link text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS asset_title2 text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS delivery_remark text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS rectification_status text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS rectification_qa_name text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS rectification_date date;
