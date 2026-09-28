-- Lead transfer history: TL-controlled reassignment from inactive agents to active agents.

CREATE TABLE IF NOT EXISTS public.lead_transfer_history (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id               uuid        REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_count            integer     NOT NULL DEFAULT 1 CHECK (lead_count >= 1),
  lead_ids              uuid[]      NULL,
  campaign_id           uuid        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  from_agent_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  to_agent_id           uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  transferred_by_tl_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  transfer_mode         text        NOT NULL CHECK (transfer_mode IN ('all', 'campaign', 'selected')),
  transferred_at        timestamptz NOT NULL DEFAULT now(),
  notes                 text        NULL
);

COMMENT ON TABLE public.lead_transfer_history IS 'Audit log for TL lead transfers from inactive agents to active agents.';
COMMENT ON COLUMN public.lead_transfer_history.lead_id IS 'Single lead when transfer_mode = selected and one lead; NULL for batch rows.';
COMMENT ON COLUMN public.lead_transfer_history.lead_count IS 'Number of leads moved in this transfer operation.';
COMMENT ON COLUMN public.lead_transfer_history.lead_ids IS 'Lead UUIDs included in batch transfers (selected / campaign / all).';
COMMENT ON COLUMN public.lead_transfer_history.transfer_mode IS 'all | campaign | selected';

CREATE INDEX IF NOT EXISTS idx_lead_transfer_history_org_transferred_at
  ON public.lead_transfer_history (organization_id, transferred_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_transfer_history_from_agent
  ON public.lead_transfer_history (from_agent_id, transferred_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_transfer_history_tl
  ON public.lead_transfer_history (transferred_by_tl_id, transferred_at DESC);

ALTER TABLE public.lead_transfer_history ENABLE ROW LEVEL SECURITY;

-- Team Leaders read transfer history in their organization.
CREATE POLICY "lead_transfer_history_select_tl"
  ON public.lead_transfer_history FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_team_leader()
  );

-- Inserts via service role (API routes use admin client).
CREATE POLICY "lead_transfer_history_insert_service"
  ON public.lead_transfer_history FOR INSERT
  TO authenticated
  WITH CHECK (true);
