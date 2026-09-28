import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { ensureClientWhatsAppLinked } from "@/lib/chat/client-whatsapp";

export const dynamic = "force-dynamic";

async function getUserContext() {
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
    .select("organization_id, client_id")
    .eq("id", user.id)
    .single();

  const profileData = profile as { organization_id: string | null; client_id: string | null } | null;
  const orgId = profileData?.organization_id;
  const userClientId = profileData?.client_id ?? null;
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

  const canViewAllClients =
    roleNames.includes("sales_manager") ||
    roleNames.includes("internal_operator") ||
    roleNames.includes("internal_admin") ||
    roleNames.includes("admin");
  const isClientViewer = roleNames.includes("client_viewer");

  if (!canViewAllClients && !isClientViewer) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, orgId, userClientId, canViewAllClients };
}

export async function GET(request: Request) {
  try {
    const ctx = await getUserContext();
    if ("error" in ctx) return ctx.error;
    const { orgId, userClientId, canViewAllClients } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const withCampaigns = searchParams.get("withCampaigns") === "1";

    let clientsQuery = admin
      .from("clients")
      .select("id, client_code, company_name, company_website, industry_type, company_size, year_established, company_address, city, state, country, contact_person, contact_full_name, contact_designation, contact_work_email, contact_mobile, contact_linkedin, services_products_offered, target_market, target_geography, current_revenue_range, existing_crm, existing_crm_which, problem_solving, services_looking_for, budget_range, expected_start_date, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (!canViewAllClients) {
      if (!userClientId) {
        return NextResponse.json({ clients: [] });
      }
      clientsQuery = clientsQuery.eq("id", userClientId);
    }

    const { data: clients, error: clientsError } = await clientsQuery;

    if (clientsError) {
      return NextResponse.json({ error: clientsError.message }, { status: 500 });
    }

    const list = (clients ?? []) as { id: string; company_name: string; created_at: string }[];

    if (!withCampaigns || list.length === 0) {
      return NextResponse.json({ clients: list });
    }

    const { data: campaigns } = await admin
      .from("campaigns")
      .select("id, campaign_id, name, status, client_id, start_date")
      .eq("organization_id", orgId)
      .in("client_id", list.map((c) => c.id));

    const campaignsList = (campaigns ?? []) as { id: string; campaign_id: string; name: string; status: string; client_id: string | null; start_date: string | null }[];
    const byClient: Record<string, typeof campaignsList> = {};
    campaignsList.forEach((c) => {
      if (c.client_id) {
        if (!byClient[c.client_id]) byClient[c.client_id] = [];
        byClient[c.client_id].push(c);
      }
    });

    const clientsWithCampaigns = list.map((c) => ({
      ...c,
      campaigns: byClient[c.id] ?? [],
    }));

    return NextResponse.json({ clients: clientsWithCampaigns });
  } catch (err) {
    console.error("List clients error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function str(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}
function num(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}
function bool(val: unknown): boolean | null {
  if (val == null) return null;
  if (typeof val === "boolean") return val;
  if (val === "true" || val === "1" || val === "yes") return true;
  if (val === "false" || val === "0" || val === "no") return false;
  return null;
}
function date(val: unknown): string | null {
  if (val == null || val === "") return null;
  if (typeof val === "string") return val;
  if (typeof (val as { format?: (f: string) => string })?.format === "function") {
    return (val as { format: (f: string) => string }).format("YYYY-MM-DD");
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const ctx = await getUserContext();
    if ("error" in ctx) return ctx.error;
    const { orgId, user } = ctx;

    const body = await request.json();

    const company_name = str(body.company_name);
    if (!company_name) {
      return NextResponse.json(
        { error: "Client name is required" },
        { status: 400 }
      );
    }

    const contact_person = str(body.contact_person);
    if (!contact_person) {
      return NextResponse.json(
        { error: "Contact person is required" },
        { status: 400 }
      );
    }

    const contact_full_name = str(body.contact_full_name);
    if (!contact_full_name) {
      return NextResponse.json(
        { error: "Full name is required" },
        { status: 400 }
      );
    }

    const country = str(body.country);
    if (!country) {
      return NextResponse.json(
        { error: "Country is required" },
        { status: 400 }
      );
    }

    const payload = {
      organization_id: orgId,
      created_by: user.id,
      client_code: str(body.client_code),
      company_name,
      company_website: str(body.company_website),
      industry_type: str(body.industry_type),
      company_size: str(body.company_size),
      year_established: num(body.year_established),
      company_address: str(body.company_address),
      city: str(body.city),
      state: str(body.state),
      country,
      contact_person,
      contact_full_name,
      contact_designation: str(body.contact_designation),
      contact_work_email: str(body.contact_work_email),
      contact_mobile: str(body.contact_mobile),
      contact_linkedin: str(body.contact_linkedin),
      services_products_offered: str(body.services_products_offered),
      target_market: str(body.target_market),
      target_geography: str(body.target_geography),
      current_revenue_range: str(body.current_revenue_range),
      existing_crm: bool(body.existing_crm),
      existing_crm_which: str(body.existing_crm_which),
      problem_solving: str(body.problem_solving),
      services_looking_for: str(body.services_looking_for),
      budget_range: str(body.budget_range),
      expected_start_date: date(body.expected_start_date),
    };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    if (!payload.client_code) {
      return NextResponse.json({ error: "Client code is required" }, { status: 400 });
    }

    const { data: client, error: insertError } = await admin
      .from("clients")
      .insert(payload as never)
      .select("id, company_name, created_at")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message || "Failed to create client" },
        { status: 500 }
      );
    }

    const row = client as { id: string; company_name: string; created_at: string } | null;
    if (row?.id && payload.contact_mobile) {
      await ensureClientWhatsAppLinked(admin, row.id, payload.contact_mobile);
    }
    return NextResponse.json({
      id: row?.id,
      company_name: row?.company_name,
      created_at: row?.created_at,
    });
  } catch (err) {
    console.error("Create client error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
