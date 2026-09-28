-- Custom questions beyond CQ5 (CQ6, CQ7, …) stored as { "cq6": "...", "cq7": "..." }.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS extra_cq jsonb NOT NULL DEFAULT '{}'::jsonb;
