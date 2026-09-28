-- Lead fields: scored (datetime), appointment (datetime), lead_tagging (dropdown)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS scored timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS appointment timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_tagging text;
