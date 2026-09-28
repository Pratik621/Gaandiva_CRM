-- Add Contact person field to clients (beside Full Name in Primary Contact section)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contact_person text;

COMMENT ON COLUMN public.clients.contact_person IS 'Contact person (e.g. primary contact label or name)';
