-- Align is_org_sales() with app RBAC: sales_manager can do everything sales can at the DB layer.
-- Fixes campaign_files / storage.objects INSERT RLS for users who only have sales_manager.

CREATE OR REPLACE FUNCTION public.is_org_sales(check_user_id uuid DEFAULT auth.uid())
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
      AND LOWER(REPLACE(r.name, ' ', '_')) IN ('sales', 'sales_manager')
  );
$$;
