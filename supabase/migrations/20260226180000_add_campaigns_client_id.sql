-- Link campaigns to clients (one client -> many campaigns)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_client_id ON public.campaigns(client_id);

COMMENT ON COLUMN public.campaigns.client_id IS 'Optional FK to clients; when set, client_name can be derived from client';
