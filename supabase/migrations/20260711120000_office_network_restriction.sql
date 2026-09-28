-- ============================================================================
-- Office-Network Restriction for Agent Role
-- Pure-agent accounts may only access the app from allowlisted office IPs.
-- DB-driven config (no redeploys), monitor-only rollout mode, and a one-click
-- emergency override. Sits on top of MFA + device whitelisting.
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.office_networks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label            text NOT NULL,                 -- "HQ Mumbai", "Branch Pune"
  cidr             text NOT NULL,                 -- "203.0.113.7/32" or "203.0.113.0/24"
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS office_networks_org_active_idx
  ON public.office_networks (organization_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.org_network_policy (
  organization_id  uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_ip_restriction_enabled boolean NOT NULL DEFAULT false,
  -- Rollout: log would-be blocks without blocking.
  monitor_only     boolean NOT NULL DEFAULT true,
  emergency_override_until timestamptz,           -- NULL = no override
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS: org members may READ (the middleware gate evaluates with the caller's
-- session); all writes go through admin APIs using the service role.
ALTER TABLE public.office_networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_network_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS office_networks_select ON public.office_networks;
CREATE POLICY office_networks_select
  ON public.office_networks FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.get_my_organization_id()));

DROP POLICY IF EXISTS org_network_policy_select ON public.org_network_policy;
CREATE POLICY org_network_policy_select
  ON public.org_network_policy FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.get_my_organization_id()));

-- Blocked-attempt lookups for the admin tile / spike alert:
-- auth_events(event_type, created_at) filtered by org.
CREATE INDEX IF NOT EXISTS idx_auth_events_org_type_created
  ON public.auth_events (organization_id, event_type, created_at DESC);

COMMENT ON TABLE public.office_networks IS
  'Allowlisted office egress IPs/CIDRs for the agent network restriction.';
COMMENT ON TABLE public.org_network_policy IS
  'Per-org toggle for agent IP restriction, monitor-only rollout flag, and emergency override window.';
