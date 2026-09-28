
CREATE TABLE IF NOT EXISTS public.simplified_meta_sources (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label             text,
  access_token      text        NOT NULL,
  page_id           text        NOT NULL,
  page_name         text,
  dataset_id        text,
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  last_synced_at    timestamptz,
  last_sync_status  text        CHECK (last_sync_status IN ('success', 'error')),
  last_sync_error   text,
  last_sync_leads   integer,
  added_by          uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_simplified_meta_sources_org_page
  ON public.simplified_meta_sources(organization_id, page_id);

ALTER TABLE public.simplified_meta_sources ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_simplified_meta_sources_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_simplified_meta_sources_updated_at ON public.simplified_meta_sources;
CREATE TRIGGER trg_simplified_meta_sources_updated_at
  BEFORE UPDATE ON public.simplified_meta_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_simplified_meta_sources_updated_at();


ALTER TABLE public.simplified_leads
  ADD COLUMN IF NOT EXISTS meta_lead_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_simplified_leads_org_meta_lead_id
  ON public.simplified_leads(organization_id, meta_lead_id)
  WHERE meta_lead_id IS NOT NULL;


CREATE OR REPLACE FUNCTION public.guard_simplified_lead_status_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() IS NOT NULL
     AND NOT public.is_org_sm_agent(auth.uid()) THEN
    RAISE EXCEPTION 'Only sm_agent users can change a lead''s status'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_simplified_lead_status_change ON public.simplified_leads;
CREATE TRIGGER trg_guard_simplified_lead_status_change
  BEFORE UPDATE OF status ON public.simplified_leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_simplified_lead_status_change();


WITH candidates AS (
  SELECT DISTINCT ON (organization_id, regexp_replace(raw_data->>'id', '^l:', '', 'i'))
    id,
    regexp_replace(raw_data->>'id', '^l:', '', 'i') AS meta_id
  FROM public.simplified_leads
  WHERE meta_lead_id IS NULL
    AND raw_data->>'id' ~* '^(l:)?[0-9]{10,}$'
  ORDER BY organization_id, regexp_replace(raw_data->>'id', '^l:', '', 'i'), created_at
)
UPDATE public.simplified_leads l
SET meta_lead_id = c.meta_id
FROM candidates c
WHERE l.id = c.id
  AND NOT EXISTS (
    SELECT 1 FROM public.simplified_leads x
    WHERE x.organization_id = l.organization_id AND x.meta_lead_id = c.meta_id
  );
