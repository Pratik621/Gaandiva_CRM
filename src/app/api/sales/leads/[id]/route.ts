import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import {
  ensureAccountForLeadRecord,
  syncLeadFollowupTask,
} from "@/lib/sales/leadAccountFollowup";
import { fetchSalesLeadIfAccessible } from "@/lib/sales/canAccessSalesLead";
import { shapeSalesLeadForApi } from "@/lib/sales/shapeSalesLead";
import { insertLeadActivity } from "@/lib/sales/leadTimeline";

export const dynamic = "force-dynamic";

const LIFECYCLE_LABELS: Record<string, string> = {
  lead: "Lead",
  marketing_qualified_lead: "Marketing Qualified Lead",
  sales_qualified_lead: "Sales Qualified Lead",
  opportunity: "Opportunity",
  customer: "Customer",
  evangelist: "Evangelist",
  other: "Other",
};

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

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getUserAndOrg();
    if ("error" in ctx) return ctx.error;
    const { user, orgId, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    const lead = await fetchSalesLeadIfAccessible(admin, orgId, params.id, {
      userId: user.id,
      isManagerOrAdmin,
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const userIds = new Set<string>();
    if (lead.assigned_agent_id) userIds.add(lead.assigned_agent_id as string);
    if (lead.created_by) userIds.add(lead.created_by as string);
    const userNames: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", [...userIds]);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach(
        (u) => {
          userNames[u.id] = u.full_name || u.email || "Unknown";
        }
      );
    }

    const accountCompanyNames: Record<string, string> = {};
    if (lead.account_id) {
      const { data: acc } = await admin
        .from("accounts")
        .select("id, company_name")
        .eq("id", lead.account_id as string)
        .maybeSingle();
      const a = acc as { id: string; company_name: string | null } | null;
      if (a) accountCompanyNames[a.id] = a.company_name ?? "—";
    }

    return NextResponse.json({
      lead: shapeSalesLeadForApi(lead, userNames, accountCompanyNames),
    });
  } catch (err) {
    console.error("Sales leads GET [id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getUserAndOrg();
    if ("error" in ctx) return ctx.error;
    const { user, orgId } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data: selfRow } = await admin
      .from("users")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const selfProfile = selfRow as { full_name: string | null; email: string | null } | null;
    const meName = selfProfile?.full_name || selfProfile?.email || "User";

    const body = await request.json();
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
      convert_to_contact,
      tags,
    }: Record<string, unknown> = body ?? {};

    const updatePayload: Record<string, unknown> = {};

    const composedLeadName =
      lead_name ||
      [first_name, last_name]
        .filter((p) => p && String(p).trim())
        .join(" ")
        .trim() ||
      null;

    if (composedLeadName !== undefined) updatePayload.lead_name = composedLeadName;
    if (first_name !== undefined) updatePayload.first_name = first_name;
    if (last_name !== undefined) updatePayload.last_name = last_name;
    if (company !== undefined) updatePayload.company_name = company;
    if (email !== undefined) updatePayload.email = email;
    if (phone !== undefined) updatePayload.phone = phone;
    if (alt_phone !== undefined) updatePayload.alt_phone = alt_phone;
    if (job_title !== undefined) updatePayload.job_title = job_title;
    if (linkedin !== undefined) updatePayload.linkedin = linkedin;
    if (department !== undefined) updatePayload.department = department;
    if (website !== undefined) updatePayload.website = website;
    if (industry !== undefined) updatePayload.industry = industry;
    if (company_size !== undefined) updatePayload.company_size = company_size;
    if (annual_revenue !== undefined) updatePayload.annual_revenue = annual_revenue;
    if (business_type !== undefined) updatePayload.business_type = business_type;
    if (gst_number !== undefined) updatePayload.gst_number = gst_number;
    if (pan_number !== undefined) updatePayload.pan_number = pan_number;
    if (country !== undefined) updatePayload.country = country;
    if (state !== undefined) updatePayload.state = state;
    if (city !== undefined) updatePayload.city = city;
    if (zip !== undefined) updatePayload.zip = zip;
    if (address !== undefined) updatePayload.address = address;
    if (budget !== undefined) updatePayload.budget = budget;
    if (decision_maker !== undefined) updatePayload.decision_maker = decision_maker;
    if (purchase_timeline !== undefined) updatePayload.purchase_timeline = purchase_timeline;
    if (current_solution !== undefined) updatePayload.current_solution = current_solution;
    if (pain_points !== undefined) updatePayload.pain_points = pain_points;
    if (requirements !== undefined) updatePayload.requirements = requirements;
    if (lead_source !== undefined) updatePayload.lead_source = lead_source;
    if (source_type !== undefined) updatePayload.source_type = source_type;
    if (source_campaign !== undefined) updatePayload.source_campaign = source_campaign;
    if (utm_source !== undefined) updatePayload.utm_source = utm_source;
    if (utm_medium !== undefined) updatePayload.utm_medium = utm_medium;
    if (utm_campaign !== undefined) updatePayload.utm_campaign = utm_campaign;
    if (deal_stage !== undefined) updatePayload.deal_stage = deal_stage;
    if (deal_value !== undefined) updatePayload.deal_value = deal_value;
    if (probability !== undefined) updatePayload.probability = probability;
    if (expected_close_date !== undefined) updatePayload.expected_close_date = expected_close_date;
    if (product_interest !== undefined) updatePayload.product_interest = product_interest;
    if (last_contacted !== undefined) updatePayload.last_contacted = last_contacted;
    if (next_followup !== undefined) updatePayload.next_followup = next_followup;
    if (followup_type !== undefined) updatePayload.followup_type = followup_type;
    if (interaction_notes !== undefined) updatePayload.interaction_notes = interaction_notes;
    if (qualification_status !== undefined) updatePayload.qualification_status = qualification_status;
    if (qa_status !== undefined) updatePayload.qa_status = qa_status;
    if (disqualification_reason !== undefined) updatePayload.disqualification_reason = disqualification_reason;
    if (rectified_reason !== undefined) updatePayload.rectified_reason = rectified_reason;
    // Only include status if it's a non-empty string that will pass the DB CHECK constraint.
    if (typeof status === "string" && status.trim().length > 0) {
      updatePayload.status = status.trim();
    }
    if (lead_score !== undefined) {
      updatePayload.lead_score =
        typeof lead_score === "string" && String(lead_score).trim()
          ? String(lead_score).trim()
          : typeof lead_score === "number"
            ? String(lead_score)
            : null;
    }
    if (assigned_to_id !== undefined) updatePayload.assigned_agent_id = assigned_to_id;
    if (tags !== undefined) updatePayload.tags = tags;

    if (convert_to_contact) {
      updatePayload.converted = true;
      updatePayload.converted_at = new Date().toISOString();
      updatePayload.status = "open_deal";
    }

    const { data: beforeRow } = await admin
      .from("sales_leads")
      .select("status, lead_score, lead_name")
      .eq("id", params.id)
      .eq("organization_id", orgId)
      .maybeSingle();

    const before = beforeRow as
      | { status: string; lead_score: string | null; lead_name: string | null }
      | null;

    const { data, error }: { data: { id: string } | null; error: { message: string } | null } =
      await admin
      .from("sales_leads")
      .update(updatePayload as never)
      .eq("organization_id", orgId)
      .eq("id", params.id)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: leadRow, error: fetchErr } = await admin
      .from("sales_leads")
      .select("*")
      .eq("id", params.id)
      .eq("organization_id", orgId)
      .single();

    if (!fetchErr && leadRow) {
      const lead = leadRow as Record<string, unknown>;
      const assignedAgentId = (lead.assigned_agent_id as string) ?? user.id;

      try {
        const accountId = await ensureAccountForLeadRecord(
          admin,
          orgId,
          assignedAgentId,
          lead.company_name as string | undefined,
          {
            industry: lead.industry as string | null,
            website: lead.website as string | null,
            phone: lead.phone as string | null,
            address: lead.address as string | null,
          }
        );
        if (accountId !== lead.account_id) {
          await admin
            .from("sales_leads")
            .update({ account_id: accountId } as never)
            .eq("id", params.id)
            .eq("organization_id", orgId);
        }
      } catch (accErr) {
        console.error("[PATCH sales/leads] ensureAccountForLeadRecord:", accErr);
      }

      await syncLeadFollowupTask(admin, orgId, {
        leadId: params.id,
        leadName: String(lead.lead_name ?? ""),
        companyName: (lead.company_name as string) ?? null,
        followupType: (lead.followup_type as string) ?? null,
        nextFollowupIso: (lead.next_followup as string) ?? null,
        assignedAgentId,
        previousTaskId: (lead.followup_task_id as string) ?? null,
        actorUserId: user.id,
      });

      if (before) {
        if (status !== undefined && before.status !== lead.status) {
          await insertLeadActivity(admin, {
            activity_type: "lifecycle_change",
            related_to_id: params.id,
            notes: `${meName} updated lead status from "${before.status}" to "${lead.status}".`,
            owner_id: user.id,
          });
        }
        if (
          lead_score !== undefined &&
          String(before.lead_score ?? "") !== String(lead.lead_score ?? "")
        ) {
          const fromL = LIFECYCLE_LABELS[String(before.lead_score ?? "")] ?? before.lead_score ?? "—";
          const toL = LIFECYCLE_LABELS[String(lead.lead_score ?? "")] ?? lead.lead_score ?? "—";
          await insertLeadActivity(admin, {
            activity_type: "lifecycle_change",
            related_to_id: params.id,
            notes: `${meName} updated the lifecycle stage for this lead from ${fromL} to ${toL}.`,
            owner_id: user.id,
          });
        }
      }
    }

    return NextResponse.json({ id: data?.id ?? params.id, success: true });
  } catch (err) {
    console.error("Sales leads PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

