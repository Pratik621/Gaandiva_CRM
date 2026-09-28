-- Unique Lead ID per Agent: LD-{AgentCode}-{Year}-{Seq}
-- Agent identifier (agent_code or fallback), current year, auto-increment per agent per year.
-- Backend-only generation; UNIQUE constraint on lead_id.

-- 1) Optional agent_code on users (for readable IDs like AGT01)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS agent_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_organization_agent_code
  ON public.users (organization_id, agent_code)
  WHERE agent_code IS NOT NULL;

COMMENT ON COLUMN public.users.agent_code IS 'Optional code for lead IDs e.g. AGT01; unique per org.';

-- 2) Sequence counter per agent per year (for concurrent-safe next number)
CREATE TABLE IF NOT EXISTS public.lead_id_sequences (
  agent_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  year int NOT NULL,
  last_seq int NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, year)
);

ALTER TABLE public.lead_id_sequences ENABLE ROW LEVEL SECURITY;

-- Only the sequence function needs to write; no direct app access required.
CREATE POLICY "lead_id_sequences_service"
  ON public.lead_id_sequences FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- 3) Function: generate next lead_id for an agent (SECURITY DEFINER, called from trigger)
CREATE OR REPLACE FUNCTION public.get_next_lead_id(p_agent_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_agent_code text;
  v_year int;
  v_seq int;
  v_lead_id text;
BEGIN
  IF p_agent_id IS NULL THEN
    RETURN 'LD-UNK-' || to_char(current_date, 'YYYY') || '-' || lpad((floor(random() * 999999)::int)::text, 6, '0');
  END IF;

  SELECT coalesce(
    agent_code,
    'A' || upper(substr(replace(p_agent_id::text, '-', ''), 1, 6))
  ) INTO v_agent_code
  FROM public.users
  WHERE id = p_agent_id;

  IF v_agent_code IS NULL OR v_agent_code = '' THEN
    v_agent_code := 'A' || upper(substr(replace(p_agent_id::text, '-', ''), 1, 6));
  END IF;

  -- Sanitize: only alphanumeric and length cap for format LD-XXX-YYYY-NNNNNN
  v_agent_code := regexp_replace(v_agent_code, '[^A-Za-z0-9]', '', 'g');
  v_agent_code := coalesce(nullif(trim(v_agent_code), ''), 'AGT');
  v_agent_code := upper(substr(v_agent_code, 1, 12));

  v_year := extract(year FROM current_date)::int;

  INSERT INTO public.lead_id_sequences (agent_id, year, last_seq)
  VALUES (p_agent_id, v_year, 1)
  ON CONFLICT (agent_id, year)
  DO UPDATE SET last_seq = public.lead_id_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  v_lead_id := 'LD-' || v_agent_code || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');
  RETURN v_lead_id;
END;
$func$;

COMMENT ON FUNCTION public.get_next_lead_id(uuid) IS 'Returns next unique lead_id for the given agent: LD-{AgentCode}-{Year}-{Seq}.';

-- 4) Add lead_id to leads; backfill then enforce UNIQUE and NOT NULL
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_id text;

-- Backfill existing rows so UNIQUE can be applied
UPDATE public.leads
SET lead_id = 'LD-LEGACY-' || id::text
WHERE lead_id IS NULL;

ALTER TABLE public.leads
  ALTER COLUMN lead_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_lead_id
  ON public.leads (lead_id);

-- 5) Trigger: set lead_id on INSERT
CREATE OR REPLACE FUNCTION public.set_lead_id_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NEW.lead_id IS NULL OR trim(NEW.lead_id) = '' THEN
    NEW.lead_id := public.get_next_lead_id(COALESCE(NEW.created_by, NEW.assigned_agent_id));
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS leads_set_lead_id ON public.leads;
CREATE TRIGGER leads_set_lead_id
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_id_on_insert();

COMMENT ON COLUMN public.leads.lead_id IS 'Unique human-readable id: LD-{AgentCode}-{Year}-{Seq}, generated on insert.';
