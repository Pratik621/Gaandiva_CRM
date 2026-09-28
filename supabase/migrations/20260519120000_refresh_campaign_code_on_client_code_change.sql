-- Recalculate campaign_code for all campaigns linked to a client (order: created_at, id).
CREATE OR REPLACE FUNCTION public.refresh_campaign_codes_for_client(p_client_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_code TEXT;
BEGIN
  IF p_client_id IS NULL THEN
    RETURN;
  END IF;

  SELECT NULLIF(TRIM(client_code), '') INTO v_client_code
  FROM public.clients
  WHERE id = p_client_id;

  IF v_client_code IS NULL THEN
    UPDATE public.campaigns
    SET campaign_code = NULL
    WHERE client_id = p_client_id;
    RETURN;
  END IF;

  WITH ranked AS (
    SELECT
      id,
      (ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1)::INTEGER AS rn
    FROM public.campaigns
    WHERE client_id = p_client_id
  )
  UPDATE public.campaigns AS c
  SET campaign_code = v_client_code || '-' || public.int_to_alpha(ranked.rn)
  FROM ranked
  WHERE c.id = ranked.id;
END;
$$;

COMMENT ON FUNCTION public.refresh_campaign_codes_for_client(UUID) IS
  'Reassigns campaign_code as {client_code}-A, -B, ... for all campaigns of this client.';

-- After client_code changes on clients, refresh all linked campaigns.
CREATE OR REPLACE FUNCTION public.trg_clients_after_client_code_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_code IS DISTINCT FROM OLD.client_code THEN
    PERFORM public.refresh_campaign_codes_for_client(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_refresh_campaign_codes ON public.clients;
CREATE TRIGGER clients_refresh_campaign_codes
  AFTER UPDATE OF client_code ON public.clients
  FOR EACH ROW
  WHEN (OLD.client_code IS DISTINCT FROM NEW.client_code)
  EXECUTE FUNCTION public.trg_clients_after_client_code_update();

-- When a campaign is moved to another client (or unlinked), renumber both sides.
CREATE OR REPLACE FUNCTION public.trg_campaigns_after_client_id_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.client_id IS NOT NULL THEN
    PERFORM public.refresh_campaign_codes_for_client(OLD.client_id);
  END IF;

  IF NEW.client_id IS NULL THEN
    UPDATE public.campaigns
    SET campaign_code = NULL
    WHERE id = NEW.id;
  ELSIF NEW.client_id IS NOT NULL THEN
    PERFORM public.refresh_campaign_codes_for_client(NEW.client_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_refresh_codes_on_client_change ON public.campaigns;
CREATE TRIGGER campaigns_refresh_codes_on_client_change
  AFTER UPDATE OF client_id ON public.campaigns
  FOR EACH ROW
  WHEN (OLD.client_id IS DISTINCT FROM NEW.client_id)
  EXECUTE FUNCTION public.trg_campaigns_after_client_id_update();
