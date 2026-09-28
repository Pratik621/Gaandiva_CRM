-- Add client_code column to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_code TEXT;

-- Unique per organization (allows NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_client_code_org
  ON public.clients (organization_id, client_code)
  WHERE client_code IS NOT NULL;

COMMENT ON COLUMN public.clients.client_code IS 'Short unique client code per organization (e.g. CYB, 7KD). Auto-assigned sequentially if not provided.';
