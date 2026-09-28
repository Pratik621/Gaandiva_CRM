-- WhatsApp chat module (Gandiv_CRM)
-- Agents must never read lead_contacts via RLS; only service role / server routes.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS wa_thread_id TEXT;

COMMENT ON COLUMN public.leads.wa_thread_id IS 'Meta WhatsApp conversation/thread id when linked.';

CREATE TABLE IF NOT EXISTS public.lead_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  wa_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_contacts IS 'WhatsApp numbers for leads; server-only. Never expose to agent UI.';
COMMENT ON COLUMN public.lead_contacts.wa_number IS 'E.164 or digits-only; encrypt at app layer when required.';

ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;

-- Deny all direct access for authenticated users (service role bypasses RLS).
CREATE POLICY lead_contacts_deny_authenticated ON public.lead_contacts
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  wa_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  sent_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_lead_id_created_at_idx ON public.messages (lead_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select_org ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      INNER JOIN public.users u ON u.id = auth.uid()
      WHERE l.id = messages.lead_id
        AND l.organization_id = u.organization_id
    )
  );

CREATE POLICY messages_insert_org ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    direction = 'outbound'
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      INNER JOIN public.users u ON u.id = auth.uid()
      WHERE l.id = messages.lead_id
        AND l.organization_id = u.organization_id
    )
  );
