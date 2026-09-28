-- Tighten trusted_devices: users must not UPDATE status via RLS.
-- Renames go through service-role API after ownership check.

DROP POLICY IF EXISTS "trusted_devices_update_own_name" ON public.trusted_devices;
REVOKE UPDATE ON public.trusted_devices FROM authenticated;
