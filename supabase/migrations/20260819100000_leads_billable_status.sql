-- Persist billable disposition on leads (MIS / agent workflow).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS billable_status text;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_billable_status_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_billable_status_check
  CHECK (
    billable_status IS NULL
    OR billable_status IN (
      'Attended',
      'Attended-Billable',
      'Attended-Non-Billable',
      'Attended-Dispute',
      'TO BE Rescheduled',
      'Decline',
      'Disqualified',
      'Client Reject',
      'Future confirmed'
    )
  );

COMMENT ON COLUMN public.leads.billable_status IS 'Post-delivery billable disposition set by MIS or assigned agent.';
