-- Idempotent: fixes databases that never applied 20260319000000_sales_leads_conversion.sql
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS converted boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS converted_account_id uuid;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS converted_contact_id uuid;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS converted_deal_id uuid;

CREATE INDEX IF NOT EXISTS idx_sales_leads_converted ON public.sales_leads (converted);
