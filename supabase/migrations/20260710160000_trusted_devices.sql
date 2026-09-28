-- Device whitelisting: org settings + trusted_devices + notifications.reference_type
-- Zero-downtime: additive tables; enabled defaults to false.

CREATE TABLE IF NOT EXISTS public.org_device_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  grace_ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  device_name text NOT NULL DEFAULT 'Unknown device',
  browser text,
  os text,
  ip_at_registration text,
  location_approx text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'revoked')),
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  last_seen_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_devices_user_token_hash
  ON public.trusted_devices (user_id, token_hash);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_status
  ON public.trusted_devices (user_id, status);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_org_status_created
  ON public.trusted_devices (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_approved_last_seen
  ON public.trusted_devices (status, last_seen_at)
  WHERE status = 'approved';

ALTER TABLE public.org_device_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_device_settings_select_org' AND tablename = 'org_device_settings') THEN
    CREATE POLICY "org_device_settings_select_org" ON public.org_device_settings FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.get_my_organization_id()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_device_settings_admin_update' AND tablename = 'org_device_settings') THEN
    CREATE POLICY "org_device_settings_admin_update" ON public.org_device_settings FOR UPDATE TO authenticated
      USING (organization_id = (SELECT public.get_my_organization_id()) AND public.is_org_admin())
      WITH CHECK (organization_id = (SELECT public.get_my_organization_id()) AND public.is_org_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_device_settings_admin_insert' AND tablename = 'org_device_settings') THEN
    CREATE POLICY "org_device_settings_admin_insert" ON public.org_device_settings FOR INSERT TO authenticated
      WITH CHECK (organization_id = (SELECT public.get_my_organization_id()) AND public.is_org_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'trusted_devices_select_own' AND tablename = 'trusted_devices') THEN
    CREATE POLICY "trusted_devices_select_own" ON public.trusted_devices FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'trusted_devices_select_org_admin' AND tablename = 'trusted_devices') THEN
    CREATE POLICY "trusted_devices_select_org_admin" ON public.trusted_devices FOR SELECT TO authenticated
      USING (
        public.is_org_admin()
        AND organization_id = (SELECT public.get_my_organization_id())
      );
  END IF;
END $$;

-- Status-changing writes and renames go through service-role API routes.

GRANT SELECT ON public.org_device_settings TO authenticated;
GRANT SELECT ON public.trusted_devices TO authenticated;
GRANT ALL ON public.org_device_settings TO service_role;
GRANT ALL ON public.trusted_devices TO service_role;

-- Extend notifications.reference_type for device_request (prod-drift safe)
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%reference_type%';

  IF cname IS NOT NULL AND cname <> 'notifications_reference_type_check_v3' THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', cname);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_reference_type_check_v3'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_reference_type_check_v3
      CHECK (
        reference_type IS NULL
        OR reference_type IN ('campaign','lead','task','deal','announcement','device_request')
      ) NOT VALID;
    ALTER TABLE public.notifications
      VALIDATE CONSTRAINT notifications_reference_type_check_v3;
  END IF;
END $$;

COMMENT ON TABLE public.org_device_settings IS
  'Org-level device whitelisting rollout (enabled + grace period).';
COMMENT ON TABLE public.trusted_devices IS
  'Per-user browser-profile devices; token_hash only — plaintext token lives in httpOnly cookie.';
