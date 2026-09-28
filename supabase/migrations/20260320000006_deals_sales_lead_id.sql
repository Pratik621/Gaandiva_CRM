-- Optional link from deal to sales lead when no CRM contact exists yet
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS sales_lead_id uuid REFERENCES public.sales_leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_deals_sales_lead_id ON public.deals (sales_lead_id);
