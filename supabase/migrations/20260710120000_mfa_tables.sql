-- MFA: org rollout settings, email enrollment, audit events, backup codes, email OTPs
-- Zero-downtime: tables are additive; enforced defaults to false.

CREATE TABLE IF NOT EXISTS public.org_mfa_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enforced boolean NOT NULL DEFAULT false,
  grace_ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_mfa_enrollment (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email_enrolled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  channel text,
  ip text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_events_org_created
  ON public.auth_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_type_created
  ON public.auth_events (user_id, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_unused
  ON public.mfa_backup_codes (user_id)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS public.mfa_email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_email_otps_user_active
  ON public.mfa_email_otps (user_id, created_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE public.org_mfa_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mfa_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_email_otps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_mfa_settings_select_org' AND tablename = 'org_mfa_settings') THEN
    CREATE POLICY "org_mfa_settings_select_org" ON public.org_mfa_settings FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.get_my_organization_id()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_mfa_settings_admin_update' AND tablename = 'org_mfa_settings') THEN
    CREATE POLICY "org_mfa_settings_admin_update" ON public.org_mfa_settings FOR UPDATE TO authenticated
      USING (organization_id = (SELECT public.get_my_organization_id()) AND public.is_org_admin())
      WITH CHECK (organization_id = (SELECT public.get_my_organization_id()) AND public.is_org_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_mfa_settings_admin_insert' AND tablename = 'org_mfa_settings') THEN
    CREATE POLICY "org_mfa_settings_admin_insert" ON public.org_mfa_settings FOR INSERT TO authenticated
      WITH CHECK (organization_id = (SELECT public.get_my_organization_id()) AND public.is_org_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_mfa_enrollment_select_own' AND tablename = 'user_mfa_enrollment') THEN
    CREATE POLICY "user_mfa_enrollment_select_own" ON public.user_mfa_enrollment FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_mfa_enrollment_select_org_admin' AND tablename = 'user_mfa_enrollment') THEN
    CREATE POLICY "user_mfa_enrollment_select_org_admin" ON public.user_mfa_enrollment FOR SELECT TO authenticated
      USING (public.is_org_admin() AND organization_id = (SELECT public.get_my_organization_id()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_events_select_org_admin' AND tablename = 'auth_events') THEN
    CREATE POLICY "auth_events_select_org_admin" ON public.auth_events FOR SELECT TO authenticated
      USING (public.is_org_admin() AND organization_id = (SELECT public.get_my_organization_id()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mfa_backup_codes_select_own' AND tablename = 'mfa_backup_codes') THEN
    CREATE POLICY "mfa_backup_codes_select_own" ON public.mfa_backup_codes FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

GRANT SELECT ON public.mfa_backup_codes TO authenticated;
GRANT SELECT ON public.org_mfa_settings TO authenticated;
GRANT SELECT ON public.user_mfa_enrollment TO authenticated;
GRANT SELECT ON public.auth_events TO authenticated;
GRANT ALL ON public.mfa_email_otps TO service_role;
