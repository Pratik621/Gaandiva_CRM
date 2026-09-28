-- Link leads to accounts (one account per normalized company name within org, enforced in app).
-- Follow-up reminder task id for syncing Next follow-up Date → tasks + notifications.
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS followup_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_leads_account_id ON public.sales_leads(account_id);
CREATE INDEX IF NOT EXISTS idx_sales_leads_followup_task_id ON public.sales_leads(followup_task_id);
