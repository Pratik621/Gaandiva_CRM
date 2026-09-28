import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { hasOperationsManagerAccess } from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import {
  normalizeClientLogoUrls,
  primaryClientLogoUrl,
} from "@/lib/admin/client-logos";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: statusRow } = await supabase
    .from("users")
    .select("status")
    .eq("id", user.id)
    .single();
  if ((statusRow as { status: string } | null)?.status === "inactive") {
    return NextResponse.json(
      { error: "Your account has been deactivated. Contact your Team Leader." },
      { status: 403 }
    );
  }

  // Fast path: one RPC round-trip instead of ~8 sequential queries. The SQL
  // function replicates the legacy logic below 1:1 (roles, manager name,
  // assigned campaigns incl. the OM/TL/agent branching, client logo + DC
  // fallback). If the function is missing or errors, fall through to the
  // legacy path so deploys never depend on migration order.
  try {
    const rpc = await supabase.rpc("get_my_profile_context" as never);
    const rpcProfile = rpc.data as Record<string, unknown> | null;
    if (!rpc.error && rpcProfile && typeof rpcProfile === "object") {
      const fromArray = Array.isArray(rpcProfile.client_logo_urls)
        ? (rpcProfile.client_logo_urls as unknown[]).filter(
            (u): u is string => typeof u === "string" && u.trim().length > 0
          )
        : [];
      const single =
        typeof rpcProfile.client_logo_url === "string" ? rpcProfile.client_logo_url : null;
      const clientLogoUrls =
        fromArray.length > 0 ? fromArray : single?.trim() ? [single.trim()] : [];
      return NextResponse.json({
        profile: {
          ...rpcProfile,
          client_logo_urls: clientLogoUrls,
          client_logo_url: primaryClientLogoUrl(clientLogoUrls),
        },
      });
    }
    if (rpc.error) {
      console.warn(
        "get_my_profile_context RPC unavailable, using legacy profile path:",
        rpc.error.message
      );
    }
  } catch (err) {
    console.warn("get_my_profile_context RPC threw, using legacy profile path:", err);
  }

  const { data: profileRaw, error } = await supabase
    .from("users")
    .select(`
      id, full_name, email, phone, employee_id, agent_code,
      date_of_birth, avatar_url, joining_date, status, created_at,
      reporting_manager_id, designation, department, employment_type,
      organization_id, client_id
    `)
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profile = profileRaw as {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    employee_id: string | null;
    agent_code: string | null;
    date_of_birth: string | null;
    avatar_url: string | null;
    joining_date: string | null;
    status: string;
    created_at: string;
    reporting_manager_id: string | null;
    designation: string | null;
    department: string | null;
    employment_type: string | null;
    organization_id: string | null;
    client_id: string | null;
  } | null;

  // Fetch roles
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role_id, roles(id, name)")
    .eq("user_id", user.id);
  const roles = (roleRows ?? [])
    .map((r: { roles: { name: string } | null }) => r.roles?.name)
    .filter(Boolean) as string[];

  // Fetch manager name if reporting_manager_id exists
  let managerName: string | null = null;
  if (profile?.reporting_manager_id) {
    const { data: manager } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", profile.reporting_manager_id)
      .single();
    const m = manager as { full_name: string | null; email: string | null } | null;
    managerName = m?.full_name || m?.email || null;
  }

  // Assigned campaigns (agents: assignments; TL: assigned_team_leader_id; OM: all org campaigns)
  let assignedCampaigns: { id: string; name: string }[] = [];
  const roleNames = await fetchUserRoleNames(supabase, user.id);
  if (hasOperationsManagerAccess(roleNames) && profile?.organization_id) {
    const { data: allCampaigns } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("name");
    assignedCampaigns = ((allCampaigns ?? []) as { id: string; name: string }[]).map((c) => ({
      id: c.id,
      name: c.name,
    }));
  }

  const { data: assignments } = await supabase
    .from("campaign_assignments")
    .select("campaign_id")
    .eq("agent_id", user.id)
    .eq("is_active", true);
  const assignmentsList = (assignments ?? []) as { campaign_id: string }[];
  if (!hasOperationsManagerAccess(roleNames) && assignmentsList.length) {
    const campaignIds = [...new Set(assignmentsList.map((a) => a.campaign_id))];
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, name")
      .in("id", campaignIds);
    const campaignsList = (campaigns ?? []) as { id: string; name: string }[];
    assignedCampaigns = campaignsList.map((c) => ({ id: c.id, name: c.name }));
  } else if (!hasOperationsManagerAccess(roleNames)) {
    const { data: tlCampaigns } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("assigned_team_leader_id", user.id);
    const tlList = (tlCampaigns ?? []) as { id: string; name: string }[];
    assignedCampaigns = tlList.map((c) => ({ id: c.id, name: c.name }));
  }

  let clientLogoUrls: string[] = [];
  const admin = getAdminClientSafe();
  const normalizedRoles = roles.map((r) => r.toLowerCase().trim().replace(/\s+/g, "_"));
  if (profile?.organization_id && admin) {
    if (profile.client_id) {
      const withUrls = await admin
        .from("clients")
        .select("logo_url, logo_urls")
        .eq("id", profile.client_id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (!withUrls.error && withUrls.data) {
        clientLogoUrls = normalizeClientLogoUrls(
          withUrls.data as { logo_url: string | null; logo_urls: string[] | null }
        );
      } else {
        const legacy = await admin
          .from("clients")
          .select("logo_url")
          .eq("id", profile.client_id)
          .eq("organization_id", profile.organization_id)
          .maybeSingle();
        clientLogoUrls = normalizeClientLogoUrls(
          legacy.data as { logo_url: string | null } | null
        );
      }
    }
    if (clientLogoUrls.length === 0 && normalizedRoles.includes("dc")) {
      const withUrls = await admin
        .from("clients")
        .select("logo_url, logo_urls, name")
        .eq("organization_id", profile.organization_id);
      if (!withUrls.error) {
        const dcClient = (
          (withUrls.data ?? []) as {
            logo_url: string | null;
            logo_urls: string[] | null;
            name: string | null;
          }[]
        ).find((c) => (c.name ?? "").trim().toLowerCase() === "dc");
        clientLogoUrls = normalizeClientLogoUrls(dcClient);
      } else {
        const { data: orgClients } = await admin
          .from("clients")
          .select("logo_url, name")
          .eq("organization_id", profile.organization_id);
        const dcClient = (
          (orgClients ?? []) as { logo_url: string | null; name: string | null }[]
        ).find((c) => (c.name ?? "").trim().toLowerCase() === "dc");
        clientLogoUrls = normalizeClientLogoUrls(dcClient);
      }
    }
  }

  return NextResponse.json({
    profile: {
      ...profile,
      roles,
      manager_name: managerName,
      assigned_campaigns: assignedCampaigns,
      joining_date: profile?.joining_date ?? profile?.created_at,
      client_logo_urls: clientLogoUrls,
      client_logo_url: primaryClientLogoUrl(clientLogoUrls),
    },
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.date_of_birth !== undefined) updates.date_of_birth = body.date_of_birth || null;
  if (body.employee_id !== undefined) updates.employee_id = body.employee_id || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("users")
    .update(updates as never)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}
