-- Per-lead type chosen by agent at create/upload (distinct from campaigns.lead_type allowed types).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_type text;

COMMENT ON COLUMN public.leads.lead_type IS
  'Lead type for this record (e.g. MQL, HQL). Set by agent on create/upload; shown in exports for QA/TL/MIS/OM.';
