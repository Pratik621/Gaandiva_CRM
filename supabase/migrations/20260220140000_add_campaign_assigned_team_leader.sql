-- Add assigned_team_leader_id to campaigns (only if campaigns table exists)
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaigns') THEN
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS assigned_team_leader_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $mig$;
