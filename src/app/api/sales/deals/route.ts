import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { resolveDealAssociate } from "@/lib/sales/resolveDealAssociate";

export const dynamic = "force-dynamic";

async function getUserAndRoles() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];

  const canAccessSales =
    roleNames.includes("sales") ||
    roleNames.includes("sales_manager") ||
    roleNames.includes("admin");

  if (!canAccessSales) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, roleNames };
}

async function getOrgIdForUser(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("organization_id").eq("id", userId).single();
  return (data as { organization_id: string | null } | null)?.organization_id ?? null;
}

export async function GET() {
  try {
    const ctx = await getUserAndRoles();
    if ("error" in ctx) return ctx.error;
    const { user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    let query = admin
      .from("deals")
      .select(
        "id, deal_name, account_id, contact_id, sales_lead_id, value, stage, pipeline, deal_type, priority, line_items, owner_id, expected_close_date, created_at"
      )
      .order("created_at", { ascending: false });

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    if (!isManagerOrAdmin) {
      query = query.eq("owner_id", user!.id);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const deals = (rows ?? []) as any[];

    const accountIds = Array.from(new Set(deals.map((d) => d.account_id).filter(Boolean))) as string[];
    const contactIds = Array.from(new Set(deals.map((d) => d.contact_id).filter(Boolean))) as string[];
    const leadIds = Array.from(new Set(deals.map((d) => d.sales_lead_id).filter(Boolean))) as string[];
    const ownerIds = Array.from(new Set(deals.map((d) => d.owner_id).filter(Boolean))) as string[];

    let accountNames: Record<string, string> = {};
    if (accountIds.length > 0) {
      const { data: accounts } = await admin
        .from("accounts")
        .select("id, company_name")
        .in("id", accountIds);
      ((accounts ?? []) as { id: string; company_name: string | null }[]).forEach((a) => {
        accountNames[a.id] = a.company_name || "—";
      });
    }

    let contactNames: Record<string, string> = {};
    if (contactIds.length > 0) {
      const { data: contacts } = await admin
        .from("contacts")
        .select("id, contact_name")
        .in("id", contactIds);
      ((contacts ?? []) as { id: string; contact_name: string | null }[]).forEach((c) => {
        contactNames[c.id] = c.contact_name || "—";
      });
    }

    let leadNames: Record<string, string> = {};
    if (leadIds.length > 0) {
      const { data: sl } = await admin.from("sales_leads").select("id, lead_name, email").in("id", leadIds);
      ((sl ?? []) as { id: string; lead_name: string | null; email: string | null }[]).forEach((l) => {
        const n = (l.lead_name ?? "").trim() || "Lead";
        const e = (l.email ?? "").trim();
        leadNames[l.id] = e ? `${n} · ${e}` : n;
      });
    }

    let ownerNames: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", ownerIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach((u) => {
        ownerNames[u.id] = u.full_name || u.email || "Unknown";
      });
    }

    const shapedDeals = deals.map((d) => ({
      id: d.id as string,
      deal_name: d.deal_name as string,
      account_id: (d.account_id as string | null) ?? null,
      account_name: d.account_id ? accountNames[d.account_id as string] ?? "—" : null,
      contact_id: (d.contact_id as string | null) ?? null,
      sales_lead_id: (d.sales_lead_id as string | null) ?? null,
      contact_name: d.contact_id
        ? contactNames[d.contact_id as string] ?? "—"
        : d.sales_lead_id
          ? leadNames[d.sales_lead_id as string] ?? "—"
          : null,
      value: (d.value as number | null) ?? null,
      stage: d.stage as string,
      pipeline: (d.pipeline as string | null) ?? "Client Acquisition pipeline",
      deal_type: (d.deal_type as string | null) ?? null,
      priority: (d.priority as string | null) ?? null,
      line_items: (d.line_items as any[] | null) ?? null,
      owner_id: (d.owner_id as string | null) ?? null,
      owner_name: d.owner_id ? ownerNames[d.owner_id as string] ?? "—" : null,
      expected_close_date: (d.expected_close_date as string | null) ?? null,
      created_at: d.created_at as string,
    }));

    return NextResponse.json({ deals: shapedDeals });
  } catch (err) {
    console.error("Sales deals GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getUserAndRoles();
    if ("error" in ctx) return ctx.error;
    const { user } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = await request.json();
    const {
      deal_name,
      account_id,
      contact_id: bodyContactId,
      sales_lead_id: bodySalesLeadId,
      deal_associate,
      value,
      stage,
      pipeline,
      deal_type,
      priority,
      line_items,
      owner_id,
      expected_close_date,
    }: {
      deal_name?: string;
      account_id?: string | null;
      contact_id?: string | null;
      sales_lead_id?: string | null;
      deal_associate?: string | null;
      value?: number | null;
      stage?: string | null;
      pipeline?: string | null;
      deal_type?: string | null;
      priority?: string | null;
      line_items?: any[] | null;
      owner_id?: string | null;
      expected_close_date?: string | null;
    } = body ?? {};

    if (!deal_name || !deal_name.trim()) {
      return NextResponse.json({ error: "Deal name is required" }, { status: 400 });
    }

    const orgId = await getOrgIdForUser(user!.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    let contact_id: string | null = bodyContactId ?? null;
    let sales_lead_id: string | null = bodySalesLeadId ?? null;

    if (deal_associate !== undefined) {
      const raw = deal_associate;
      if (raw === null || raw === "") {
        contact_id = null;
        sales_lead_id = null;
      } else {
        try {
          const r = await resolveDealAssociate(admin, orgId, String(raw));
          contact_id = r.contact_id;
          sales_lead_id = r.sales_lead_id;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Invalid contact / lead";
          return NextResponse.json({ error: msg }, { status: 400 });
        }
      }
    }

    const insertPayload = {
      deal_name: deal_name.trim(),
      account_id: account_id ?? null,
      contact_id,
      sales_lead_id,
      value: value ?? null,
      stage: stage ?? "introductory_meeting",
      pipeline: pipeline ?? "Client Acquisition pipeline",
      deal_type: deal_type ?? null,
      priority: priority ?? null,
      line_items: line_items ?? null,
      owner_id: owner_id ?? user!.id,
      expected_close_date: expected_close_date ?? null,
    };

    const { data, error } = await admin
      .from("deals")
      .insert(insertPayload as never)
      .select(
        "id, deal_name, account_id, contact_id, sales_lead_id, value, stage, pipeline, deal_type, priority, line_items, owner_id, expected_close_date, created_at"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deal: data }, { status: 201 });
  } catch (err) {
    console.error("Sales deals POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

