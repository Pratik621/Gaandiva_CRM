-- Client-level WhatsApp chat: one thread per (client, campaign). No leads in chat UI.

CREATE TABLE IF NOT EXISTS public.client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  wa_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_contacts IS 'WhatsApp numbers for clients; server-only. Never expose to agent UI.';

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_contacts_deny_authenticated ON public.client_contacts
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  wa_thread_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS chat_threads_campaign_id_idx ON public.chat_threads (campaign_id);
CREATE INDEX IF NOT EXISTS chat_threads_client_id_idx ON public.chat_threads (client_id);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_threads_select_org ON public.chat_threads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.organization_id = chat_threads.organization_id
    )
  );

CREATE POLICY chat_threads_insert_org ON public.chat_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.organization_id = chat_threads.organization_id
    )
  );

CREATE POLICY chat_threads_update_org ON public.chat_threads
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.organization_id = chat_threads.organization_id
    )
  );

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE;

ALTER TABLE public.messages
  ALTER COLUMN lead_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS messages_thread_id_created_at_idx
  ON public.messages (thread_id, created_at DESC)
  WHERE thread_id IS NOT NULL;

CREATE POLICY messages_select_thread ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    thread_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chat_threads t
      INNER JOIN public.users u ON u.id = auth.uid()
      WHERE t.id = messages.thread_id
        AND t.organization_id = u.organization_id
    )
  );

CREATE POLICY messages_insert_thread ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    direction = 'outbound'
    AND thread_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chat_threads t
      INNER JOIN public.users u ON u.id = auth.uid()
      WHERE t.id = messages.thread_id
        AND t.organization_id = u.organization_id
    )
  );
