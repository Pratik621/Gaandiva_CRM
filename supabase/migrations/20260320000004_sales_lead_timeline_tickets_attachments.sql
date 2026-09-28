-- Widen activity types for notes and timeline events (skip if activities table missing)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activities'
  ) THEN
    ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_activity_type_check;
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_activity_type_check CHECK (
        activity_type = ANY (
          ARRAY[
            'call','meeting','email','demo',
            'note','lifecycle_change','system','task'
          ]::text[]
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sales_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sales_lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  description text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_tickets_status_check CHECK (status = ANY (ARRAY['open','pending','resolved','closed']::text[])),
  CONSTRAINT sales_tickets_priority_check CHECK (priority = ANY (ARRAY['low','medium','high']::text[]))
);

CREATE INDEX IF NOT EXISTS idx_sales_tickets_lead ON public.sales_tickets(sales_lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_tickets_org ON public.sales_tickets(organization_id);

CREATE TABLE IF NOT EXISTS public.sales_lead_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sales_lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_lead_attachments_lead ON public.sales_lead_attachments(sales_lead_id);
