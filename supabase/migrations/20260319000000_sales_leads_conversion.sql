-- Add conversion tracking fields to sales_leads
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS converted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_account_id uuid,
  ADD COLUMN IF NOT EXISTS converted_contact_id uuid,
  ADD COLUMN IF NOT EXISTS converted_deal_id uuid;

-- Index for quick lookup of unconverted vs converted leads
CREATE INDEX IF NOT EXISTS idx_sales_leads_converted
  ON public.sales_leads (converted);
