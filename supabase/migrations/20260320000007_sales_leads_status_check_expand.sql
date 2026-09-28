-- Expand sales_leads status CHECK constraint to support full CRM status workflow.
-- Also preserves legacy values (contacted, interested, closed_lost) for existing data.
ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_status_check;
ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_status_check CHECK (
  status = ANY (ARRAY[
    'new'::text,
    'open'::text,
    'in_progress'::text,
    'open_deal'::text,
    'unqualified'::text,
    'attempted_to_contact'::text,
    'connected'::text,
    'bad_timing'::text,
    'contacted'::text,
    'interested'::text,
    'closed_lost'::text
  ])
);
