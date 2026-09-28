-- Additive: extend tl_campaign_lead_counts with disqualified_leads.
-- Return type changed, so REPLACE alone fails — drop then recreate.
-- App code falls back to a paginated tally if this RPC is briefly unavailable.

DROP FUNCTION IF EXISTS public.tl_campaign_lead_counts(uuid, uuid[]);

CREATE FUNCTION public.tl_campaign_lead_counts(
  p_org_id uuid,
  p_campaign_ids uuid[]
)
RETURNS TABLE (
  campaign_id uuid,
  total_leads bigint,
  qualified_leads bigint,
  disqualified_leads bigint,
  delivered_leads bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.campaign_id,
    COUNT(*)::bigint AS total_leads,
    COUNT(*) FILTER (
      WHERE lower(trim(coalesce(l.qa_status, ''))) IN ('qualified', 'approved', 'pass')
    )::bigint AS qualified_leads,
    COUNT(*) FILTER (
      WHERE lower(trim(coalesce(l.qa_status, ''))) = 'disqualified'
    )::bigint AS disqualified_leads,
    COUNT(*) FILTER (
      WHERE lower(trim(coalesce(l.delivery_status, ''))) = 'delivered'
    )::bigint AS delivered_leads
  FROM public.leads l
  WHERE l.organization_id = p_org_id
    AND l.campaign_id = ANY(p_campaign_ids)
  GROUP BY l.campaign_id;
$$;

COMMENT ON FUNCTION public.tl_campaign_lead_counts(uuid, uuid[]) IS
  'Aggregated lead counts per campaign for TL campaigns list API (includes disqualified).';

GRANT EXECUTE ON FUNCTION public.tl_campaign_lead_counts(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tl_campaign_lead_counts(uuid, uuid[]) TO service_role;
