-- Keep campaigns.achieved in sync with MIS-delivered leads (delivery_status = 'delivered').

CREATE OR REPLACE FUNCTION public.refresh_campaign_achieved(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.campaigns c
  SET achieved = (
    SELECT COUNT(*)::integer
    FROM public.leads l
    WHERE l.campaign_id = c.id
      AND l.organization_id = c.organization_id
      AND lower(trim(coalesce(l.delivery_status, ''))) = 'delivered'
  )
  WHERE c.id = p_campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_campaign_pending_allocation(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.campaigns c
  SET pending_allocation = GREATEST(
    0,
    COALESCE(c.total_allocation, 0) - COALESCE(c.achieved, 0)
  )
  WHERE c.id = p_campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leads_achieved_trigger_fn()
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
    PERFORM public.refresh_campaign_achieved(OLD.campaign_id);
    PERFORM public.refresh_campaign_pending_allocation(OLD.campaign_id);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.refresh_campaign_achieved(NEW.campaign_id);
    PERFORM public.refresh_campaign_pending_allocation(NEW.campaign_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    old_cid := OLD.campaign_id;
    new_cid := NEW.campaign_id;
    IF old_cid IS DISTINCT FROM new_cid
       OR OLD.delivery_status IS DISTINCT FROM NEW.delivery_status THEN
      IF old_cid IS DISTINCT FROM new_cid THEN
        PERFORM public.refresh_campaign_achieved(old_cid);
        PERFORM public.refresh_campaign_pending_allocation(old_cid);
        PERFORM public.refresh_campaign_achieved(new_cid);
        PERFORM public.refresh_campaign_pending_allocation(new_cid);
      ELSE
        PERFORM public.refresh_campaign_achieved(COALESCE(new_cid, old_cid));
        PERFORM public.refresh_campaign_pending_allocation(COALESCE(new_cid, old_cid));
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS leads_achieved_trigger ON public.leads;
CREATE TRIGGER leads_achieved_trigger
  AFTER INSERT OR UPDATE OF delivery_status, campaign_id OR DELETE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_achieved_trigger_fn();

-- Backfill existing campaigns
UPDATE public.campaigns c
SET achieved = (
  SELECT COUNT(*)::integer
  FROM public.leads l
  WHERE l.campaign_id = c.id
    AND l.organization_id = c.organization_id
    AND lower(trim(coalesce(l.delivery_status, ''))) = 'delivered'
)
WHERE EXISTS (
  SELECT 1 FROM public.leads l WHERE l.campaign_id = c.id
);

UPDATE public.campaigns c
SET pending_allocation = GREATEST(
  0,
  COALESCE(c.total_allocation, 0) - COALESCE(c.achieved, 0)
);

CREATE OR REPLACE FUNCTION public.campaigns_pending_allocation_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.total_allocation IS DISTINCT FROM OLD.total_allocation THEN
    PERFORM public.refresh_campaign_pending_allocation(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_pending_allocation_trigger ON public.campaigns;
CREATE TRIGGER campaigns_pending_allocation_trigger
  AFTER UPDATE OF total_allocation ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.campaigns_pending_allocation_trigger_fn();
