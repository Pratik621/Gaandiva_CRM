-- =============================================================================
-- Add "Email Marketing Manager" role to all existing organizations
-- =============================================================================

INSERT INTO public.roles (organization_id, name, description)
SELECT
  o.id,
  'Email Marketing Manager',
  'Email marketing — Lead Finder, campaigns, and leads'
FROM public.organizations o
WHERE o.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.organization_id = o.id
      AND lower(replace(r.name, ' ', '_')) = 'email_marketing_manager'
  );
