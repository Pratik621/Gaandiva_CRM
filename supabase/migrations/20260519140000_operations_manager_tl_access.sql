-- Operations Manager uses the same org-level campaign/lead access as Team Leader.
CREATE OR REPLACE FUNCTION public.is_org_team_leader(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = check_user_id
      AND LOWER(REPLACE(r.name, ' ', '_')) IN ('team_leader', 'tl', 'operations_manager')
  );
$$;
