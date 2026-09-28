import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { applyScoredLeadTaggingFilter } from "@/lib/lead-tagging";

export const dynamic = "force-dynamic";

const LIMIT = 6;

async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const roleNames = (
    (roleRows ?? []) as { roles: { name: string } | null }[]
  )
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];

  return { user, orgId, roleNames };
}

export async function GET(request: Request) {
  try {
    const ctx = await getContext();
    if ("error" in ctx) return ctx.error;
    const { user, orgId, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const category = searchParams.get("category") ?? "all";

    if (!q || q.length < 1) {
      return NextResponse.json({ results: { campaigns: [], leads: [], users: [] } });
    }

    const pattern = `%${q}%`;
    const isAdmin  = roleNames.includes("admin");
    const isTL     =
      roleNames.includes("team_leader") ||
      roleNames.includes("tl") ||
      roleNames.includes("operations_manager");
    const isQA     = roleNames.includes("qa");
    const isMIS    = roleNames.includes("mis");
    const isAgent  = roleNames.includes("agent");

    const results: { campaigns: unknown[]; leads: unknown[]; users: unknown[] } = {
      campaigns: [],
      leads: [],
      users: [],
    };

    // ── Campaigns ──────────────────────────────────────────────────────────────
    if (category === "all" || category === "campaigns") {
      if (isAgent) {
        // Agents only see their assigned campaigns
        const { data: assignedIds } = await admin
          .from("campaign_assignments")
          .select("campaign_id")
          .eq("agent_id", user!.id)
          .eq("is_active", true as never);

        const ids = ((assignedIds ?? []) as { campaign_id: string }[]).map(
          (a) => a.campaign_id
        );

        if (ids.length > 0) {
          const { data } = await admin
            .from("campaigns")
            .select("id, name, client_name, status, industry, campaign_id")
            .in("id", ids)
            .or(
              `name.ilike.${pattern},client_name.ilike.${pattern},industry.ilike.${pattern},campaign_id.ilike.${pattern}`
            )
            .limit(LIMIT);

          results.campaigns = shapeCampaigns(data ?? [], "agent");
        }
      } else {
        // TL, QA, MIS, Admin see all org campaigns
        const { data } = await admin
          .from("campaigns")
          .select("id, name, client_name, status, industry, campaign_id")
          .eq("organization_id", orgId)
          .or(
            `name.ilike.${pattern},client_name.ilike.${pattern},industry.ilike.${pattern},campaign_id.ilike.${pattern}`
          )
          .limit(LIMIT);

        const roleKey = isAdmin ? "admin" : isTL ? "tl" : isQA ? "qa" : "mis";
        results.campaigns = shapeCampaigns(data ?? [], roleKey);
      }
    }

    // ── Leads (campaign-type from `leads` table) ───────────────────────────────
    if (category === "all" || category === "leads") {
      let query = admin
        .from("leads")
        .select("id, name, company_name, email, phone, status, campaign_id, assigned_agent_id")
        .or(
          `name.ilike.${pattern},company_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`
        )
        .limit(LIMIT);

      if (isAgent) {
        query = query.eq("assigned_agent_id", user!.id);
      } else if (isQA) {
        // QA typically reviews scored / scored-equivalent leads
        query = applyScoredLeadTaggingFilter(query);
      }
      // TL, MIS, Admin see all org leads (leads table is org-scoped via campaigns)

      const { data } = await query;
      const roleKey = isAdmin ? "admin" : isTL ? "tl" : isQA ? "qa" : isMIS ? "mis" : "agent";
      results.leads = shapeLeads(data ?? [], roleKey);
    }

    // ── Users (admin + TL only) ────────────────────────────────────────────────
    if ((isAdmin || isTL) && (category === "all" || category === "users")) {
      const { data } = await admin
        .from("users")
        .select("id, full_name, email, department, designation")
        .eq("organization_id", orgId)
        .or(`full_name.ilike.${pattern},email.ilike.${pattern},department.ilike.${pattern},designation.ilike.${pattern}`)
        .limit(LIMIT);

      const roleKey = isAdmin ? "admin" : "tl";
      results.users = shapeUsers(data ?? [], roleKey);
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Global search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Shapers ────────────────────────────────────────────────────────────────────

const CAMPAIGN_URLS: Record<string, string> = {
  agent:  "/agent/campaigns",
  tl:     "/tl/campaigns",
  qa:     "/qa/campaigns",
  mis:    "/mis/dashboard",
  admin:  "/tl/campaigns",
};

const LEAD_URLS: Record<string, string> = {
  agent:  "/agent/campaigns",
  tl:     "/tl/campaigns",
  qa:     "/qa/campaigns",
  mis:    "/mis/dashboard",
  admin:  "/tl/campaigns",
};

const USER_URLS: Record<string, string> = {
  admin: "/admin/users",
  tl:    "/tl/users",
};

function shapeCampaigns(data: Record<string, unknown>[], role: string) {
  return data.map((r) => ({
    id:       r.id,
    title:    r.name ?? "—",
    subtitle: r.client_name ? String(r.client_name) : (r.industry ? String(r.industry) : "—"),
    meta:     r.status ? String(r.status) : null,
    type:     "campaign",
    url:      `${CAMPAIGN_URLS[role] ?? "/tl/campaigns"}`,
  }));
}

function shapeLeads(data: Record<string, unknown>[], role: string) {
  return data.map((r) => ({
    id:       r.id,
    title:    r.name ?? "—",
    subtitle: r.email ? String(r.email) : (r.phone ? String(r.phone) : "—"),
    meta:     r.company_name ? String(r.company_name) : null,
    type:     "lead",
    url:      `${LEAD_URLS[role] ?? "/tl/campaigns"}`,
  }));
}

function shapeUsers(data: Record<string, unknown>[], role: string) {
  return data.map((r) => ({
    id:       r.id,
    title:    r.full_name ?? r.email ?? "—",
    subtitle: r.email ? String(r.email) : "—",
    meta:     r.department ? String(r.department) : (r.designation ? String(r.designation) : null),
    type:     "user",
    url:      `${USER_URLS[role] ?? "/admin/users"}`,
  }));
}
