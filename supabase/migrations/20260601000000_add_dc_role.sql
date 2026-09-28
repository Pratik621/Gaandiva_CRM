-- =============================================================================
-- Add "dc" role to all existing organizations
-- =============================================================================

INSERT INTO public.roles (organization_id, name, description)
SELECT
  o.id,
  'dc',
  'DC (Data Coordinator) — can view assigned campaigns and update delivery status'
FROM public.organizations o
WHERE o.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.organization_id = o.id
      AND lower(r.name) = 'dc'
  );
