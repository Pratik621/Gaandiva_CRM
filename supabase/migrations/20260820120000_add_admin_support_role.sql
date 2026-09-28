-- Admin Support is a restricted operational role: Users, Devices, and Settings only.
-- The application route/API layer enforces the module-level restriction.

INSERT INTO public.roles (organization_id, name, description)
SELECT
  o.id,
  'admin_support',
  'Restricted access to Users, Devices, and Settings only'
FROM public.organizations o
WHERE o.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.organization_id = o.id
      AND lower(replace(r.name, ' ', '_')) = 'admin_support'
  );
