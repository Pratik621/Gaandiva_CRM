-- Persist agent/creator name on leads so "Created By" survives user deletion (FK ON DELETE SET NULL).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS creator_display_name text;

COMMENT ON COLUMN public.leads.creator_display_name IS
  'Snapshot of creator display name at insert; preserved when users row is deleted.';

-- Backfill from current creator FK
UPDATE public.leads l
SET creator_display_name = COALESCE(NULLIF(trim(u.full_name), ''), NULLIF(trim(u.email), ''))
FROM public.users u
WHERE l.created_by = u.id
  AND (l.creator_display_name IS NULL OR trim(l.creator_display_name) = '');

-- Backfill from assigned agent when creator FK is empty
UPDATE public.leads l
SET creator_display_name = COALESCE(NULLIF(trim(u.full_name), ''), NULLIF(trim(u.email), ''))
FROM public.users u
WHERE l.created_by IS NULL
  AND l.assigned_agent_id = u.id
  AND (l.creator_display_name IS NULL OR trim(l.creator_display_name) = '');

-- Restore FK from lead_id token when user still exists (LD-{AgentToken}-{Year}-{Seq})
UPDATE public.leads l
SET
  created_by = COALESCE(l.created_by, u.id),
  assigned_agent_id = COALESCE(l.assigned_agent_id, u.id),
  creator_display_name = COALESCE(
    l.creator_display_name,
    NULLIF(trim(u.full_name), ''),
    NULLIF(trim(u.email), '')
  )
FROM public.users u
WHERE l.created_by IS NULL
  AND l.lead_id ~ '^LD-[^-]+-[0-9]{4}-[0-9]+$'
  AND (
    upper(split_part(l.lead_id, '-', 2)) = upper(coalesce(nullif(trim(u.agent_code), ''), ''))
    OR upper(split_part(l.lead_id, '-', 2)) = 'A' || upper(substr(replace(u.id::text, '-', ''), 1, 6))
    OR upper(split_part(l.lead_id, '-', 2)) = upper(substr(replace(u.id::text, '-', ''), 1, 7))
  );

CREATE OR REPLACE FUNCTION public.leads_snapshot_creator_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_name text;
BEGIN
  IF NEW.creator_display_name IS NOT NULL AND trim(NEW.creator_display_name) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(email), ''))
  INTO v_name
  FROM public.users
  WHERE id = COALESCE(NEW.created_by, NEW.assigned_agent_id);

  IF v_name IS NOT NULL THEN
    NEW.creator_display_name := v_name;
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS leads_snapshot_creator_display_name ON public.leads;
CREATE TRIGGER leads_snapshot_creator_display_name
  BEFORE INSERT OR UPDATE OF created_by, assigned_agent_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_snapshot_creator_display_name();

-- Preserve name on user delete (created_by / assigned_agent_id become NULL via FK)
CREATE OR REPLACE FUNCTION public.users_preserve_lead_creator_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_name text;
BEGIN
  v_name := COALESCE(NULLIF(trim(OLD.full_name), ''), NULLIF(trim(OLD.email), ''));
  IF v_name IS NULL THEN
    RETURN OLD;
  END IF;

  UPDATE public.leads
  SET creator_display_name = v_name
  WHERE (created_by = OLD.id OR assigned_agent_id = OLD.id)
    AND (creator_display_name IS NULL OR trim(creator_display_name) = '');

  RETURN OLD;
END;
$func$;

DROP TRIGGER IF EXISTS users_preserve_lead_creator_on_delete ON public.users;
CREATE TRIGGER users_preserve_lead_creator_on_delete
  BEFORE DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_preserve_lead_creator_on_delete();
