-- =============================================================================
-- USER MODULE: Multi-tenant SaaS CRM
-- Production-ready schema with RBAC, RLS, and Supabase Auth integration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ORGANIZATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan_type text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. USERS (maps to auth.uid())
-- -----------------------------------------------------------------------------
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name text,
  email text,
  phone text,
  department text,
  designation text,
  reporting_manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  employment_type text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. ROLES (organization-scoped)
-- -----------------------------------------------------------------------------
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- -----------------------------------------------------------------------------
-- 4. USER_ROLES (junction table)
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  UNIQUE(user_id, role_id)
);

-- -----------------------------------------------------------------------------
-- 5. LOGIN_LOGS (audit trail)
-- -----------------------------------------------------------------------------
CREATE TABLE public.login_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  login_time timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  device_info text
);

-- -----------------------------------------------------------------------------
-- INDEXES (production performance)
-- -----------------------------------------------------------------------------
CREATE INDEX idx_users_organization_id ON public.users(organization_id);
CREATE INDEX idx_users_reporting_manager_id ON public.users(reporting_manager_id);
CREATE INDEX idx_users_status ON public.users(status);
CREATE INDEX idx_users_email ON public.users(email);

CREATE INDEX idx_roles_organization_id ON public.roles(organization_id);

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON public.user_roles(role_id);

CREATE INDEX idx_login_logs_user_id ON public.login_logs(user_id);
CREATE INDEX idx_login_logs_login_time ON public.login_logs(login_time DESC);

-- -----------------------------------------------------------------------------
-- HELPER: Check if current user has admin role in their organization
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_admin(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = check_user_id
      AND r.name = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- HELPER: Get current user's organization_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- AUTH TRIGGER: Auto-insert user on signup
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- ORGANIZATIONS: Users see only their own organization
CREATE POLICY "org_select_own"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (
    id = public.get_my_organization_id()
  );

-- USERS: Agents see own profile; Admins see all in org
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_select_org_admin"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin()
    AND organization_id = public.get_my_organization_id()
  );

-- USERS: Admins can update users in their org (for assigning org_id, etc.)
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_org_admin"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin()
    AND organization_id = public.get_my_organization_id()
  )
  WITH CHECK (
    organization_id = public.get_my_organization_id()
  );

-- ROLES: Users see roles in their organization
CREATE POLICY "roles_select_org"
  ON public.roles FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
  );

-- USER_ROLES: See roles for users you can see
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_roles.user_id
        AND u.organization_id = public.get_my_organization_id()
        AND public.is_org_admin()
    )
  );

-- USER_ROLES: Only admins can manage role assignments
CREATE POLICY "user_roles_insert_admin"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin()
    AND EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.roles r ON r.id = role_id
      WHERE u.id = user_id
        AND r.organization_id = u.organization_id
        AND u.organization_id = public.get_my_organization_id()
    )
  );

CREATE POLICY "user_roles_delete_admin"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (
    public.is_org_admin()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_roles.user_id
        AND u.organization_id = public.get_my_organization_id()
    )
  );

-- LOGIN_LOGS: Users see only their own logs
CREATE POLICY "login_logs_select_own"
  ON public.login_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- LOGIN_LOGS: Users can insert their own login log (called from app)
CREATE POLICY "login_logs_insert_own"
  ON public.login_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- GRANTS (service role has full access; authenticated uses RLS)
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.roles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT ON public.login_logs TO authenticated;

-- Service role bypasses RLS for admin operations
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.roles TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.login_logs TO service_role;

-- -----------------------------------------------------------------------------
-- COMMENTS
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.users.organization_id IS 'Set by admin after signup. NULL until assigned.';
COMMENT ON TABLE public.roles IS 'Organization-scoped roles. Create "admin" role per org for admin access.';
