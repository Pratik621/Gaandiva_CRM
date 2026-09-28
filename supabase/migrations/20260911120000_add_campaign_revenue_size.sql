-- Additive: target revenue size ranges on campaigns (mirrors employee_size)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS revenue_size text[];

COMMENT ON COLUMN public.campaigns.revenue_size IS 'Target revenue size ranges (Under $1 Million, $1 Million – $5 Million, ..., Over $1 Billion, All)';
