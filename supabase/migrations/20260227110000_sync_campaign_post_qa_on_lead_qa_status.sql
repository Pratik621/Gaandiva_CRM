-- Keep campaigns.post_qa in sync with count of leads where qa_status = 'qualified'
CREATE OR REPLACE FUNCTION public.refresh_campaign_post_qa(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.campaigns c
  SET post_qa = (
    SELECT COUNT(*)::integer
    FROM public.leads l
    WHERE l.campaign_id = c.id
      AND l.organization_id = c.organization_id
      AND l.qa_status = 'qualified'
  )
  WHERE c.id = p_campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leads_post_qa_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_cid uuid;
  new_cid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_campaign_post_qa(OLD.campaign_id);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM refresh_campaign_post_qa(NEW.campaign_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    old_cid := OLD.campaign_id;
    new_cid := NEW.campaign_id;
    IF old_cid IS DISTINCT FROM new_cid THEN
      PERFORM refresh_campaign_post_qa(old_cid);
      PERFORM refresh_campaign_post_qa(new_cid);
    ELSE
      PERFORM refresh_campaign_post_qa(COALESCE(new_cid, old_cid));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS leads_post_qa_trigger ON public.leads;
CREATE TRIGGER leads_post_qa_trigger
  AFTER INSERT OR UPDATE OF qa_status, campaign_id OR DELETE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_post_qa_trigger_fn();

-- Backfill existing campaigns
UPDATE public.campaigns c
SET post_qa = (
  SELECT COUNT(*)::integer
  FROM public.leads l
  WHERE l.campaign_id = c.id
    AND l.organization_id = c.organization_id
    AND l.qa_status = 'qualified'
)
WHERE EXISTS (
  SELECT 1 FROM public.leads l WHERE l.campaign_id = c.id
);
