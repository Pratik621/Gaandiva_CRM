import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const LIMIT = 6; // results per category

async function getUserAndOrg() {
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

  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];

  const canAccess =
    roleNames.includes("sales") ||
    roleNames.includes("sales_manager") ||
    roleNames.includes("admin");

  if (!canAccess) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const isManagerOrAdmin =
    roleNames.includes("sales_manager") || roleNames.includes("admin");

  return { user, orgId, isManagerOrAdmin };
}

export async function GET(request: Request) {
  try {
    const ctx = await getUserAndOrg();
    if ("error" in ctx) return ctx.error;
    const { user, orgId, isManagerOrAdmin } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const category = searchParams.get("category") ?? "all";

    if (!q || q.length < 1) {
      return NextResponse.json({
        results: {
          clients: [],
          campaigns: [],
          companies: [],
          contacts: [],
          deals: [],
          leads: [],
        },
      });
    }

    const pattern = `%${q}%`;
    const results: {
      clients: unknown[];
      campaigns: unknown[];
      companies: unknown[];
      contacts: unknown[];
      deals: unknown[];
      leads: unknown[];
    } = {
      clients: [],
      campaigns: [],
      companies: [],
      contacts: [],
      deals: [],
      leads: [],
    };

    // ── Clients (CRM clients table) ───────────────────────────────────────────
    if (isManagerOrAdmin && (category === "all" || category === "clients")) {
      const { data } = await admin
        .from("clients")
        .select("id, company_name, client_code, industry_type, contact_full_name, contact_work_email, city, country")
        .eq("organization_id", orgId)
        .or(
          `company_name.ilike.${pattern},client_code.ilike.${pattern},industry_type.ilike.${pattern},contact_full_name.ilike.${pattern},contact_work_email.ilike.${pattern},contact_person.ilike.${pattern},city.ilike.${pattern},country.ilike.${pattern}`
        )
        .limit(LIMIT);

      results.clients = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        title: (r.company_name as string) || (r.client_code as string) || "—",
        subtitle: (r.contact_full_name as string) || (r.contact_work_email as string) || "—",
        meta: [r.industry_type, r.city, r.country].filter(Boolean).join(" · ") || null,
        type: "client",
        url: "/sales/clients",
      }));
    }

    // ── Campaigns ─────────────────────────────────────────────────────────────
    if (category === "all" || category === "campaigns") {
      const { data } = await admin
        .from("campaigns")
        .select("id, name, client_name, status, industry, campaign_id, campaign_code")
        .eq("organization_id", orgId)
        .or(
          `name.ilike.${pattern},client_name.ilike.${pattern},industry.ilike.${pattern},campaign_id.ilike.${pattern},campaign_code.ilike.${pattern}`
        )
        .limit(LIMIT);

      results.campaigns = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        title: (r.name as string) || "—",
        subtitle: (r.client_name as string) || (r.industry as string) || "—",
        meta: r.status ? String(r.status) : null,
        type: "campaign",
        url: `/sales/campaigns/${r.id}`,
      }));
    }

    // ── Companies / Accounts ─────────────────────────────────────────────────
    if (category === "all" || category === "companies") {
      let query = admin
        .from("accounts")
        .select("id, company_name, industry, website, owner_id")
        .or(`company_name.ilike.${pattern},industry.ilike.${pattern},website.ilike.${pattern}`)
        .limit(LIMIT);

      if (!isManagerOrAdmin) query = query.eq("owner_id", user!.id);

      const { data } = await query;
      results.companies = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.company_name ?? "—",
        subtitle: r.industry ? String(r.industry) : (r.website ? String(r.website) : "—"),
        type: "company",
        url: `/sales/accounts`,
      }));
    }

    // ── Contacts ─────────────────────────────────────────────────────────────
    if (category === "all" || category === "contacts") {
      let query = admin
        .from("contacts")
        .select("id, contact_name, email, phone, job_title, account_id, owner_id")
        .or(`contact_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},job_title.ilike.${pattern}`)
        .limit(LIMIT);

      if (!isManagerOrAdmin) query = query.eq("owner_id", user!.id);

      const { data } = await query;

      // enrich with account names
      const accountIds = Array.from(
        new Set((data ?? []).map((c: Record<string, unknown>) => c.account_id).filter(Boolean))
      ) as string[];
      let accountMap: Record<string, string> = {};
      if (accountIds.length > 0) {
        const { data: accounts } = await admin
          .from("accounts")
          .select("id, company_name")
          .in("id", accountIds);
        (accounts ?? []).forEach((a: Record<string, unknown>) => {
          accountMap[a.id as string] = (a.company_name as string) ?? "—";
        });
      }

      results.contacts = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.contact_name ?? "—",
        subtitle: r.email ?? (r.phone ? String(r.phone) : "—"),
        meta: r.account_id ? accountMap[r.account_id as string] ?? null : null,
        type: "contact",
        url: `/sales/contacts`,
      }));
    }

    // ── Deals ─────────────────────────────────────────────────────────────────
    if (category === "all" || category === "deals") {
      let query = admin
        .from("deals")
        .select("id, deal_name, value, stage, account_id, owner_id")
        .or(`deal_name.ilike.${pattern},stage.ilike.${pattern}`)
        .limit(LIMIT);

      if (!isManagerOrAdmin) query = query.eq("owner_id", user!.id);

      const { data } = await query;
      results.deals = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.deal_name ?? "—",
        subtitle: r.value != null ? `$${Number(r.value).toLocaleString("en-IN")}` : "—",
        meta: r.stage ? String(r.stage) : null,
        type: "deal",
        url: `/sales/deals`,
      }));
    }

    // ── Leads ─────────────────────────────────────────────────────────────────
    if (category === "all" || category === "leads") {
      let query = admin
        .from("sales_leads")
        .select("id, lead_name, company, email, phone, status, organization_id")
        .eq("organization_id", orgId)
        .or(`lead_name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
        .limit(LIMIT);

      if (!isManagerOrAdmin) {
        query = query.or(`assigned_agent_id.eq.${user!.id},created_by.eq.${user!.id}`);
      }

      const { data } = await query;
      results.leads = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.lead_name ?? "—",
        subtitle: r.email ?? (r.phone ? String(r.phone) : "—"),
        meta: r.company ? String(r.company) : null,
        type: "lead",
        url: `/sales/leads`,
      }));
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Global search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
