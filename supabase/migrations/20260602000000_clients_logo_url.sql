-- Client logo for client_viewer dashboard header
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.clients.logo_url IS 'Client logo URL (Supabase Storage) shown on client viewer dashboard header';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('client-logos', 'client-logos', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
