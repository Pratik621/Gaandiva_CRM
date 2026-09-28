import { NextResponse, type NextRequest } from "next/server";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import {
  ensureAccountForLeadRecord,
  syncLeadFollowupTask,
} from "@/lib/sales/leadAccountFollowup";
import { SALES_LEADS_SELECT } from "@/lib/sales/salesLeadSelect";
import { shapeSalesLeadForApi } from "@/lib/sales/shapeSalesLead";
import { insertLeadActivity } from "@/lib/sales/leadTimeline";

export const dynamic = "force-dynamic";

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

  const canAccessSalesLeads =
    roleNames.includes("sales") ||
    roleNames.includes("sales_manager") ||
    roleNames.includes("admin");
  if (!canAccessSalesLeads) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, orgId, roleNames };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getUserAndOrg();
    if ("error" in ctx) return ctx.error;
    const { orgId, user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { page, limit, offset } = parseListPagination(request.nextUrl.searchParams);
    const searchRaw = request.nextUrl.searchParams.get("q")?.trim() || "";

    let query = admin
      .from("sales_leads")
      .select(SALES_LEADS_SELECT, { count: "exact" })
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    // Sales Manager & Admin: see entire team's leads. Sales: leads they own or are assigned.
    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");
    if (!isManagerOrAdmin) {
      query = query.or(
        `assigned_agent_id.eq.${user!.id},created_by.eq.${user!.id}`
      );
    }

    if (searchRaw.length > 0) {
      const safe = searchRaw.replace(/%/g, "").replace(/_/g, "");
      if (safe.length > 0) {
        query = query.or(
          `name.ilike.%${safe}%,company_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`
        );
      }
    }

    const { data: leadsRes, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const leads = (leadsRes ?? []) as any[];

    const userIds = Array.from(
      new Set(
        leads
          .flatMap((l: any) => [l.assigned_agent_id, l.created_by])
          .filter(Boolean) as string[]
      )
    );

    let userNames: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach(
        (u) => {
          userNames[u.id] = u.full_name || u.email || "Unknown";
        }
      );
    }

    const accountIds = Array.from(
      new Set(leads.map((l: any) => l.account_id).filter(Boolean) as string[])
    );
    const accountCompanyNames: Record<string, string> = {};
    if (accountIds.length > 0) {
      const { data: accs } = await admin
        .from("accounts")
        .select("id, company_name")
        .in("id", accountIds);
      ((accs ?? []) as { id: string; company_name: string | null }[]).forEach((a) => {
        accountCompanyNames[a.id] = a.company_name ?? "—";
      });
    }

    const { data: agentUsers } = await admin
      .from("users")
      .select("id, full_name, email, department")
      .eq("organization_id", orgId);

    const agents =
      (agentUsers ?? []).map((u: any) => ({
        id: u.id as string,
        name: (u.full_name as string | null) || (u.email as string | null) || "Unknown",
        department: (u.department as string | null) ?? null,
      })) ?? [];

    const shapedLeads = leads.map((l: any) =>
      shapeSalesLeadForApi(l as Record<string, unknown>, userNames, accountCompanyNames)
    );

    return NextResponse.json({
      leads: shapedLeads,
      agents,
      pagination: buildPaginationMeta(page, limit, count ?? shapedLeads.length),
    });
  } catch (err) {
    console.error("Sales leads GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let debugStatus: unknown = null;
  try {
    const ctx = await getUserAndOrg();
    if ("error" in ctx) return ctx.error;
    const { user, orgId } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = await request.json();
    debugStatus = (body as Record<string, unknown> | null)?.status;
    const {
      lead_name,
      first_name,
      last_name,
      company,
      email,
      phone,
      alt_phone,
      job_title,
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
      lead_source,
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
      status,
      lead_score,
      assigned_to_id,
      tags,
    }: Record<string, unknown> = body ?? {};

    const composedLeadName =
      lead_name ||
      [first_name, last_name]
        .filter((p) => p && String(p).trim())
        .join(" ")
        .trim() ||
      null;

    const assignedAgentId = (assigned_to_id as string | undefined) ?? user!.id;

    let accountId: string | null = null;
    try {
      accountId = await ensureAccountForLeadRecord(
        admin,
        orgId,
        assignedAgentId,
        company as string | undefined,
        {
          industry: industry as string | null,
          website: website as string | null,
          phone: phone as string | null,
          address: address as string | null,
        }
      );
    } catch (accErr) {
      console.error("[sales/leads POST] ensureAccountForLeadRecord:", accErr);
      return NextResponse.json(
        { error: accErr instanceof Error ? accErr.message : "Failed to resolve account" },
        { status: 500 }
      );
    }

    const insertPayload: Record<string, unknown> = {
      organization_id: orgId,
      lead_name: composedLeadName,
      first_name: first_name ?? null,
      last_name: (last_name as string | null) ?? null,
      company_name: (company as string | null) ?? null,
      email: (email as string | null) ?? null,
      phone: (phone as string | null) ?? null,
      alt_phone: (alt_phone as string | null) ?? null,
      job_title: (job_title as string | null) ?? null,
      linkedin: (linkedin as string | null) ?? null,
      department: (department as string | null) ?? null,
      website: (website as string | null) ?? null,
      industry: (industry as string | null) ?? null,
      company_size: (company_size as string | null) ?? null,
      annual_revenue: (annual_revenue as string | null) ?? null,
      business_type: (business_type as string | null) ?? null,
      gst_number: (gst_number as string | null) ?? null,
      pan_number: (pan_number as string | null) ?? null,
      country: (country as string | null) ?? null,
      state: (state as string | null) ?? null,
      city: (city as string | null) ?? null,
      zip: (zip as string | null) ?? null,
      address: (address as string | null) ?? null,
      budget: (budget as string | null) ?? null,
      decision_maker: (decision_maker as string | null) ?? null,
      purchase_timeline: (purchase_timeline as string | null) ?? null,
      current_solution: (current_solution as string | null) ?? null,
      pain_points: (pain_points as string | null) ?? null,
      requirements: (requirements as string | null) ?? null,
      lead_source: (lead_source as string | null) ?? null,
      source_type: (source_type as string | null) ?? null,
      source_campaign: (source_campaign as string | null) ?? null,
      utm_source: (utm_source as string | null) ?? null,
      utm_medium: (utm_medium as string | null) ?? null,
      utm_campaign: (utm_campaign as string | null) ?? null,
      deal_stage: (deal_stage as string | null) ?? null,
      deal_value: (deal_value as string | null) ?? null,
      probability:
        typeof probability === "number" ? (probability as number) : null,
      expected_close_date: (expected_close_date as string | null) ?? null,
      product_interest: (product_interest as string | null) ?? null,
      last_contacted: (last_contacted as string | null) ?? null,
      next_followup: (next_followup as string | null) ?? null,
      followup_type: (followup_type as string | null) ?? null,
      interaction_notes: (interaction_notes as string | null) ?? null,
      qualification_status: (qualification_status as string | null) ?? null,
      qa_status: (qa_status as string | null) ?? null,
      disqualification_reason:
        (disqualification_reason as string | null) ?? null,
      rectified_reason: (rectified_reason as string | null) ?? null,
      lead_score:
        typeof lead_score === "string" && String(lead_score).trim()
          ? String(lead_score).trim()
          : typeof lead_score === "number"
            ? String(lead_score)
            : null,
      assigned_agent_id: assignedAgentId,
      account_id: accountId,
      created_by: user!.id,
      tags: (tags as string[]) ?? [],
    };

    const { data, error } = await admin
      .from("sales_leads")
      .insert(insertPayload as never)
      .select(SALES_LEADS_SELECT)
      .single();

    if (error) {
      if (String(error?.message ?? "").includes("sales_leads_status_check")) {
        console.error("[sales/leads POST] status_check violation", {
          statusSent: debugStatus,
          statusInserted: (insertPayload as any)?.status,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = data as Record<string, unknown>;
    await syncLeadFollowupTask(admin, orgId, {
      leadId: row.id as string,
      leadName: String(composedLeadName ?? ""),
      companyName: (row.company_name as string | null) ?? null,
      followupType: (followup_type as string | null) ?? null,
      nextFollowupIso: (next_followup as string | null) ?? null,
      assignedAgentId,
      previousTaskId: null,
      actorUserId: user!.id,
    });

    await insertLeadActivity(admin, {
      activity_type: "system",
      related_to_id: row.id as string,
      notes: "This lead was created from the CRM.",
      owner_id: user!.id,
    });

    return NextResponse.json({ lead: data }, { status: 201 });
  } catch (err) {
    if (String((err as any)?.message ?? err).includes("sales_leads_status_check")) {
      console.error("[sales/leads POST] status_check violation (catch)", {
        statusSent: debugStatus,
      });
    }
    console.error("Sales leads POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

