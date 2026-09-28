-- ============================================================
-- Migration: campaign_code_from_client
-- Auto-generate campaign_code from client_code (e.g. Client-1-A, Client-1-B ...)
-- ============================================================

-- Helper: convert 0-based integer to Excel-style letters (0→A, 25→Z, 26→AA …)
CREATE OR REPLACE FUNCTION public.int_to_alpha(n INTEGER)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  result TEXT := '';
  rem    INTEGER;
BEGIN
  n := n + 1;
  WHILE n > 0 LOOP
    rem    := (n - 1) % 26;
    result := chr(65 + rem) || result;
    n      := (n - 1) / 26;
  END LOOP;
  RETURN result;
END;
$$;

-- Generate next campaign code for a client: {client_code}-A, -B, -C …
CREATE OR REPLACE FUNCTION public.generate_campaign_code(
  p_client_id      UUID,
  p_org_id         UUID
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_code TEXT;
  v_count       INTEGER;
BEGIN
  SELECT client_code INTO v_client_code
  FROM public.clients
  WHERE id = p_client_id AND organization_id = p_org_id;

  IF v_client_code IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.campaigns
  WHERE client_id = p_client_id
    AND organization_id = p_org_id;

  RETURN v_client_code || '-' || public.int_to_alpha(v_count);
END;
$$;

COMMENT ON FUNCTION public.generate_campaign_code IS
  'Returns next campaign code for a client: {client_code}-A, -B, -C ...';

-- Add campaign_code column
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS campaign_code TEXT;

COMMENT ON COLUMN public.campaigns.campaign_code IS
  'Auto-generated client-based code: {client_code}-A, -B, -C ...';

-- Trigger function: auto-set campaign_code on INSERT when client_id is provided
CREATE OR REPLACE FUNCTION public.set_campaign_code_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF NEW.client_id IS NOT NULL AND (
    NEW.campaign_code IS NULL OR NEW.campaign_code = ''
  ) THEN
    v_code := public.generate_campaign_code(NEW.client_id, NEW.organization_id);
    IF v_code IS NOT NULL THEN
      NEW.campaign_code := v_code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_set_campaign_code ON public.campaigns;
CREATE TRIGGER campaigns_set_campaign_code
  BEFORE INSERT ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_campaign_code_on_insert();

COMMENT ON TRIGGER campaigns_set_campaign_code ON public.campaigns IS
  'Auto-generates campaign_code = {client_code}-A/B/C... when client_id is set and campaign_code is blank.';

-- Backfill existing campaigns ordered by created_at within each client
WITH ranked AS (
  SELECT
    c.id,
    cl.client_code,
    (ROW_NUMBER() OVER (
      PARTITION BY c.client_id, c.organization_id
      ORDER BY c.created_at ASC, c.id ASC
    ) - 1)::INTEGER AS rn
  FROM public.campaigns c
  JOIN public.clients cl ON cl.id = c.client_id
  WHERE c.client_id IS NOT NULL
    AND cl.client_code IS NOT NULL
)
UPDATE public.campaigns
SET campaign_code = ranked.client_code || '-' || public.int_to_alpha(ranked.rn)
FROM ranked
WHERE campaigns.id = ranked.id
  AND campaigns.campaign_code IS NULL;
