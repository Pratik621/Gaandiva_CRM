import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

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
      .from("contacts")
      .select("id, contact_name, email, phone, job_title, account_id, owner_id, created_at, status")
      .order("created_at", { ascending: false });

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    if (!isManagerOrAdmin) {
      // Sales users see only their own contacts.
      query = query.eq("owner_id", user!.id);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const contacts = (rows ?? []) as {
      id: string;
      contact_name: string | null;
      email: string | null;
      phone: string | null;
      job_title: string | null;
      account_id: string | null;
      owner_id: string | null;
      created_at: string;
      status: string | null;
    }[];

    const accountIds = Array.from(
      new Set(contacts.map((c) => c.account_id).filter(Boolean) as string[])
    );
    const ownerIds = Array.from(
      new Set(contacts.map((c) => c.owner_id).filter(Boolean) as string[])
    );

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

    let ownerNames: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", ownerIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach(
        (u) => {
          ownerNames[u.id] = u.full_name || u.email || "Unknown";
        }
      );
    }

    const shapedContacts = contacts.map((c) => ({
      id: c.id,
      contact_name: c.contact_name,
      email: c.email,
      phone: c.phone,
      job_title: c.job_title,
      account_id: c.account_id,
      account_name: c.account_id ? accountNames[c.account_id] ?? "—" : null,
      owner_id: c.owner_id,
      owner_name: c.owner_id ? ownerNames[c.owner_id] ?? "—" : null,
      created_at: c.created_at,
      status: c.status ?? null,
    }));

    return NextResponse.json({ contacts: shapedContacts });
  } catch (err) {
    console.error("Sales contacts GET error:", err);
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
      contact_name,
      email,
      phone,
      job_title,
      account_id,
      owner_id,
      // Leads parity fields (all optional)
      status,
      lead_source,
      lead_score,
      first_name,
      last_name,
      alt_phone,
      linkedin,
      department,
      website,
      industry,
      company_size,
      annual_revenue,
      business_type,
      gst_number,
      pan_number,
      country,
      state,
      city,
      zip,
      address,
      budget,
      decision_maker,
      purchase_timeline,
      current_solution,
      pain_points,
      requirements,
      source_type,
      source_campaign,
      utm_source,
      utm_medium,
      utm_campaign,
      deal_stage,
      deal_value,
      probability,
      expected_close_date,
      product_interest,
      last_contacted,
      next_followup,
      followup_type,
      interaction_notes,
      qualification_status,
      qa_status,
      disqualification_reason,
      rectified_reason,
      tags,
    }: {
      contact_name?: string;
      email?: string | null;
      phone?: string | null;
      job_title?: string | null;
      account_id?: string | null;
      owner_id?: string | null;
      status?: string | null;
      lead_source?: string | null;
      lead_score?: number | null;
      first_name?: string | null;
      last_name?: string | null;
      alt_phone?: string | null;
      linkedin?: string | null;
      department?: string | null;
      website?: string | null;
      industry?: string | null;
      company_size?: string | null;
      annual_revenue?: string | null;
      business_type?: string | null;
      gst_number?: string | null;
      pan_number?: string | null;
      country?: string | null;
      state?: string | null;
      city?: string | null;
      zip?: string | null;
      address?: string | null;
      budget?: string | null;
      decision_maker?: string | null;
      purchase_timeline?: string | null;
      current_solution?: string | null;
      pain_points?: string | null;
      requirements?: string | null;
      source_type?: string | null;
      source_campaign?: string | null;
      utm_source?: string | null;
      utm_medium?: string | null;
      utm_campaign?: string | null;
      deal_stage?: string | null;
      deal_value?: string | null;
      probability?: number | null;
      expected_close_date?: string | null;
      product_interest?: string | null;
      last_contacted?: string | null;
      next_followup?: string | null;
      followup_type?: string | null;
      interaction_notes?: string | null;
      qualification_status?: string | null;
      qa_status?: string | null;
      disqualification_reason?: string | null;
      rectified_reason?: string | null;
      tags?: string[] | null;
    } = body ?? {};

    if (!contact_name || !contact_name.trim()) {
      return NextResponse.json({ error: "Contact name is required" }, { status: 400 });
    }

    const insertPayload = {
      contact_name: contact_name.trim(),
      email: email ?? null,
      phone: phone ?? null,
      job_title: job_title ?? null,
      account_id: account_id ?? null,
      owner_id: owner_id ?? user!.id,

      status: status ?? null,
      lead_source: lead_source ?? null,
      lead_score: typeof lead_score === "number" ? lead_score : null,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      alt_phone: alt_phone ?? null,
      linkedin: linkedin ?? null,
      department: department ?? null,
      website: website ?? null,
      industry: industry ?? null,
      company_size: company_size ?? null,
      annual_revenue: annual_revenue ?? null,
      business_type: business_type ?? null,
      gst_number: gst_number ?? null,
      pan_number: pan_number ?? null,
      country: country ?? null,
      state: state ?? null,
      city: city ?? null,
      zip: zip ?? null,
      address: address ?? null,
      budget: budget ?? null,
      decision_maker: decision_maker ?? null,
      purchase_timeline: purchase_timeline ?? null,
      current_solution: current_solution ?? null,
      pain_points: pain_points ?? null,
      requirements: requirements ?? null,
      source_type: source_type ?? null,
      source_campaign: source_campaign ?? null,
      utm_source: utm_source ?? null,
      utm_medium: utm_medium ?? null,
      utm_campaign: utm_campaign ?? null,
      deal_stage: deal_stage ?? null,
      deal_value: deal_value ?? null,
      probability: typeof probability === "number" ? probability : null,
      expected_close_date: expected_close_date ?? null,
      product_interest: product_interest ?? null,
      last_contacted: last_contacted ?? null,
      next_followup: next_followup ?? null,
      followup_type: followup_type ?? null,
      interaction_notes: interaction_notes ?? null,
      qualification_status: qualification_status ?? null,
      qa_status: qa_status ?? null,
      disqualification_reason: disqualification_reason ?? null,
      rectified_reason: rectified_reason ?? null,
      tags: Array.isArray(tags) ? tags : null,
    };

    const { data, error } = await admin
      .from("contacts")
      .insert(insertPayload as never)
      .select("id, contact_name, email, phone, job_title, account_id, owner_id, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (err) {
    console.error("Sales contacts POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

