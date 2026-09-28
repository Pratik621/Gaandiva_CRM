-- Fast per-campaign lead counts for /api/tl/campaigns (avoids fetching all lead rows).

CREATE OR REPLACE FUNCTION public.tl_campaign_lead_counts(
  p_org_id uuid,
  p_campaign_ids uuid[]
)
RETURNS TABLE (
  campaign_id uuid,
  total_leads bigint,
  qualified_leads bigint,
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
      WHERE lower(trim(coalesce(l.delivery_status, ''))) = 'delivered'
    )::bigint AS delivered_leads
  FROM public.leads l
  WHERE l.organization_id = p_org_id
    AND l.campaign_id = ANY(p_campaign_ids)
  GROUP BY l.campaign_id;
$$;

COMMENT ON FUNCTION public.tl_campaign_lead_counts(uuid, uuid[]) IS
  'Aggregated lead counts per campaign for TL campaigns list API.';

GRANT EXECUTE ON FUNCTION public.tl_campaign_lead_counts(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tl_campaign_lead_counts(uuid, uuid[]) TO service_role;
