import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import { AGENT_READONLY_LEAD_FIELD_SET } from "@/lib/agent-lead-fields";
import { normalizeExtraCq } from "@/lib/extra-cq";
import { enrichLeadsWithCreatorNames } from "@/lib/lead-display-names";
import { logAudit } from "@/lib/audit/log";
import { normalizeLeadTaggingValue } from "@/lib/lead-tagging";
import { checkDuplicateLead } from "@/lib/leads/checkDuplicateLead";
import {
  isLeadDuplicateDbError,
  leadDuplicateApiPayload,
} from "@/lib/leads/leadDuplicateDbError";
import { normalizeBillableStatus } from "@/lib/leads/billable-status";
import {
  createCallLogsLead,
  listCallLogsLeads,
  resolveCallLogsLeadContext,
  updateCallLogsLead,
} from "@/lib/call-logs-leads";

export const dynamic = "force-dynamic";

function buildDuplicateLeadResponse(payload?: {
  duplicate_lead_id?: string | null;
  duplicate_reason?: string | null;
}) {
  return NextResponse.json(
    {
      error: "Duplicate lead",
      message: "This lead already exists in this campaign.",
      duplicate_lead_id: payload?.duplicate_lead_id ?? null,
      duplicate_reason: payload?.duplicate_reason ?? null,
    },
    { status: 409 }
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const { data: assignment } = await supabase
      .from("campaign_assignments")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("agent_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const { page, limit, offset } = parseListPagination(new URL(request.url).searchParams);

    const callLogsCtx = await resolveCallLogsLeadContext({
      mainDb: supabase,
      userId: user.id,
      userEmail: user.email,
      orgId,
      campaignId,
    });
    if (callLogsCtx instanceof NextResponse) return callLogsCtx;
    if (callLogsCtx) {
      const { data, error, count } = await listCallLogsLeads(callLogsCtx, offset, limit);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const leadsWithNames = await enrichLeadsWithCreatorNames(
        supabase,
        (data ?? []) as Parameters<typeof enrichLeadsWithCreatorNames>[1],
        orgId
      );
      return NextResponse.json({
        leads: leadsWithNames,
        pagination: buildPaginationMeta(page, limit, count ?? 0),
      });
    }

    const leadsSelectBase = "id, lead_id, name, company_name, phone, email, city, status, followup_date, notes, assigned_agent_id, created_by, creator_display_name, created_at, updated_at, job_title, job_function, job_level, direct_number, industry, company_number, employee_size, address, state, country, zip_code, founded_years, founded_years_link, revenue_range, revenue_link, contact_linkedin_url, company_linkedin_url, scored, scored_timezone, appointment, appointment_timezone, lead_type, lead_tagging, lead_disposition, delivery_status, delivered_at, billable_status";
    const leadsSelectExtended = leadsSelectBase + ", salutation, first_name, last_name, domain, phone_number_link, department, job_title_link, tenurity, vv_status, email_status, ev_tool, see_all_employees, employee_size_link, company_website_link, sic_code, sic_code_link, naics_code, naics_code_link, ra_comment, special_comments, call_back, call_notes, primary_reason, secondary_reason, qa_comments, cq1, cq2, cq3, cq4, cq5, extra_cq, audit_date, qa_name, qa_audited_by_id, qa_audited_at, asset_title, asset_title2, address2, address_link, actual_employee_size, industry_type_link";
    let leadsList: unknown[] | null = null;
    let leadsError: { message?: string } | null = null;
    let total = 0;
    let res = await supabase
      .from("leads")
      .select(leadsSelectExtended + ", qa_status, disqualification_reasons, disqualification_reason, rectified_reason", {
        count: "exact",
      })
      .eq("campaign_id", campaignId)
      .eq("assigned_agent_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    leadsList = res.data;
    leadsError = res.error;
    total = res.count ?? 0;
    if (leadsError && (res.error?.message?.includes("column") || res.error?.message?.includes("qa_status"))) {
      res = await supabase
        .from("leads")
        .select(leadsSelectBase + ", qa_status, disqualification_reasons, disqualification_reason, rectified_reason", {
          count: "exact",
        })
        .eq("campaign_id", campaignId)
        .eq("assigned_agent_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      leadsList = res.data;
      leadsError = res.error;
      total = res.count ?? 0;
    }

    if (leadsError) {
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    type LeadRow = {
      id: string;
      lead_id: string | null;
      name: string | null;
      company_name: string | null;
      phone: string | null;
      email: string | null;
      city: string | null;
      status: string;
      followup_date: string | null;
      notes: string | null;
      assigned_agent_id: string | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
      job_title: string | null;
      job_function: string | null;
      job_level: string | null;
      direct_number: string | null;
      industry: string | null;
      company_number: string | null;
      employee_size: string | null;
      address: string | null;
      state: string | null;
      country: string | null;
      zip_code: string | null;
      founded_years: number | null;
      founded_years_link: string | null;
      revenue_range: string | null;
      revenue_link: string | null;
      contact_linkedin_url: string | null;
      company_linkedin_url: string | null;
      scored: string | null;
      appointment: string | null;
      lead_tagging: string | null;
      lead_disposition: string | null;
      qa_status?: string | null;
      disqualification_reasons?: string | null;
      disqualification_reason?: string | null;
      rectified_reason?: string | null;
    };
    const rawLeads = (leadsList ?? []) as Record<string, unknown>[];
    const leads = rawLeads.map((row) => ({
      ...row,
      qa_status: (row.qa_status as string | null) ?? null,
      disqualification_reasons: (row.disqualification_reasons as string | null) ?? null,
      disqualification_reason: (row.disqualification_reason as string | null) ?? null,
      rectified_reason: (row.rectified_reason as string | null) ?? null,
    })) as LeadRow[];
    const leadsWithNames = await enrichLeadsWithCreatorNames(supabase, leads, orgId);

    // Voice recordings are fetched lazily by the table cells via
    // POST /api/leads/voice-recordings — embedding them here cost one storage
    // listing per lead and made the list crawl.
    return NextResponse.json({
      leads: leadsWithNames,
      pagination: buildPaginationMeta(page, limit, total),
    });
  } catch (err) {
    console.error("Agent leads fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    // Ensure agent is assigned to this campaign
    const { data: assignment } = await supabase
      .from("campaign_assignments")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("agent_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "You are not assigned to this campaign" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      first_name,
      last_name,
      salutation,
      company_name,
      phone,
      email,
      domain,
      direct_number,
      company_number,
      phone_number_link,
      job_title,
      job_level,
      department,
      job_function,
      job_title_link,
      tenurity,
      vv_status,
      email_status,
      ev_tool,
      address,
      city,
      state,
      country,
      zip_code,
      employee_size,
      see_all_employees,
      industry,
      employee_size_link,
      company_website_link,
      revenue_range,
      revenue_link,
      sic_code,
      sic_code_link,
      naics_code,
      naics_code_link,
      founded_years,
      founded_years_link,
      contact_linkedin_url,
      company_linkedin_url,
      scored,
      scored_timezone,
      appointment,
      appointment_timezone,
      lead_type,
      lead_tagging,
      ra_comment,
      special_comments,
      call_back,
      call_notes,
      primary_reason,
      secondary_reason,
      qa_comments,
      cq1,
      cq2,
      cq3,
      cq4,
      cq5,
      extra_cq,
      audit_date,
      qa_name,
      asset_title,
      status,
      lead_disposition,
      followup_date,
      notes,
    } = body ?? {};

    const normalizeString = (value: unknown): string | null =>
      typeof value === "string" ? value.trim() || null : null;

    const normalizedLeadType = normalizeString(lead_type);
    if (!normalizedLeadType) {
      return NextResponse.json({ error: "Lead type is required" }, { status: 400 });
    }

    const normalizedFirstName = normalizeString(first_name);
    const normalizedLastName = normalizeString(last_name);
    const normalizedName = normalizeString(name);
    const normalizedCompanyName = normalizeString(company_name);
    const normalizedEmail = normalizeString(email);
    const normalizedDomain = normalizeString(domain);

    const derivedName =
      [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ").trim() ||
      normalizedName ||
      null;

    if (!derivedName && !normalizedCompanyName && !normalizedEmail && !phone) {
      return NextResponse.json(
        { error: "At least one of name, company, email, or phone is required" },
        { status: 400 }
      );
    }

    const leadStatus =
      typeof status === "string" && status.length > 0 ? status : "new";

    const leadPayload = {
        name: derivedName || null,
        first_name: normalizedFirstName || null,
        last_name: normalizedLastName || null,
        salutation: salutation || null,
        company_name: normalizedCompanyName || null,
        phone: phone || null,
        email: normalizedEmail || null,
        domain: normalizedDomain || null,
        direct_number: direct_number || null,
        company_number: company_number || null,
        phone_number_link: phone_number_link || null,
        job_title: job_title || null,
        job_level: job_level || null,
        department: department || null,
        job_function: job_function || null,
        job_title_link: job_title_link || null,
        tenurity: tenurity || null,
        vv_status: vv_status || null,
        address: address || null,
        city: city || null,
        state: state || null,
        country: country || null,
        zip_code: zip_code || null,
        employee_size: employee_size || null,
        see_all_employees: see_all_employees || null,
        industry: industry || null,
        employee_size_link: employee_size_link || null,
        company_website_link: company_website_link || null,
        revenue_range: revenue_range || null,
        revenue_link: revenue_link || null,
        sic_code: sic_code || null,
        sic_code_link: sic_code_link || null,
        naics_code: naics_code || null,
        naics_code_link: naics_code_link || null,
        founded_years: founded_years ?? null,
        founded_years_link: founded_years_link || null,
        contact_linkedin_url: contact_linkedin_url || null,
        company_linkedin_url: company_linkedin_url || null,
        scored: scored || null,
        scored_timezone: scored_timezone || null,
        appointment: appointment || null,
        appointment_timezone: appointment_timezone || null,
        lead_type: normalizedLeadType,
        lead_tagging: lead_tagging || null,
        ra_comment: ra_comment || null,
        special_comments: special_comments || null,
        call_back: call_back || null,
        call_notes: call_notes || null,
        primary_reason: primary_reason || null,
        secondary_reason: secondary_reason || null,
        cq1: cq1 || null,
        cq2: cq2 || null,
        cq3: cq3 || null,
        cq4: cq4 || null,
        cq5: cq5 || null,
        extra_cq: normalizeExtraCq(extra_cq) ?? {},
        audit_date: audit_date || null,
        qa_name: qa_name || null,
        asset_title: asset_title || null,
        status: leadStatus,
        lead_disposition: lead_disposition || null,
        followup_date: followup_date || null,
        notes: notes || null,
        created_by: user.id,
      };

    const callLogsCtx = await resolveCallLogsLeadContext({
      mainDb: supabase,
      userId: user.id,
      userEmail: user.email,
      orgId,
      campaignId,
    });
    if (callLogsCtx instanceof NextResponse) return callLogsCtx;
    if (callLogsCtx) {
      const result = await createCallLogsLead(callLogsCtx, leadPayload);
      if ("duplicate" in result) return buildDuplicateLeadResponse(result.duplicate);
      if (!result.ok) return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
      return NextResponse.json({ lead_id: result.lead_id ?? result.id, id: result.id });
    }

    const { data: inserted, error: insertError } = await supabase.rpc(
      "agent_create_campaign_lead" as never,
      {
        p_campaign_id: campaignId,
        p_payload: leadPayload,
      } as never
    );

    if (insertError) {
      if (isLeadDuplicateDbError(insertError)) {
        return NextResponse.json(leadDuplicateApiPayload(insertError), { status: 409 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const insertedResult = (inserted ?? null) as
      | {
          duplicate?: boolean;
          duplicate_lead_id?: string | null;
          duplicate_reason?: string | null;
          id?: string;
          lead_id?: string | null;
        }
      | null;
    if (insertedResult?.duplicate) {
      return buildDuplicateLeadResponse(insertedResult);
    }

    const row = insertedResult
      ? { id: insertedResult.id ?? "", lead_id: insertedResult.lead_id ?? null }
      : null;

    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: "agent",
      category: "leads",
      eventType: "lead_created",
      description: `Created lead ${row?.lead_id ?? row?.id ?? ""} (${derivedName || normalizedCompanyName || normalizedEmail || "no name"})`,
      targetType: "lead",
      targetId: row?.id ?? null,
      targetLabel: row?.lead_id ?? null,
      metadata: { campaign_id: campaignId, lead_type: normalizedLeadType },
      request,
    });

    return NextResponse.json({ lead_id: row?.lead_id ?? row?.id, id: row?.id });
  } catch (err) {
    console.error("Agent leads create error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)
      ?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign ID required" },
        { status: 400 }
      );
    }

    // Ensure agent is assigned to this campaign
    const { data: assignment } = await supabase
      .from("campaign_assignments")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("agent_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "You are not assigned to this campaign" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      id: leadRowId,
      name,
      first_name,
      last_name,
      salutation,
      company_name,
      phone,
      email,
      domain,
      direct_number,
      company_number,
      phone_number_link,
      job_title,
      job_level,
      department,
      job_function,
      job_title_link,
      tenurity,
      vv_status,
      email_status,
      ev_tool,
      address,
      city,
      state,
      country,
      zip_code,
      employee_size,
      see_all_employees,
      industry,
      employee_size_link,
      company_website_link,
      revenue_range,
      revenue_link,
      sic_code,
      sic_code_link,
      naics_code,
      naics_code_link,
      founded_years,
      founded_years_link,
      contact_linkedin_url,
      company_linkedin_url,
      scored,
      scored_timezone,
      appointment,
      appointment_timezone,
      lead_type,
      lead_tagging,
      ra_comment,
      special_comments,
      call_back,
      call_notes,
      primary_reason,
      secondary_reason,
      qa_comments,
      cq1,
      cq2,
      cq3,
      cq4,
      cq5,
      extra_cq,
      audit_date,
      qa_name,
      asset_title,
      status,
      lead_disposition,
      followup_date,
      notes,
      billable_status,
    } = body ?? {};

    if (!leadRowId) {
      return NextResponse.json(
        { error: "Lead id is required" },
        { status: 400 }
      );
    }

    const derivedName =
      [first_name, last_name].filter(Boolean).join(" ").trim() || name || null;

    const updates: Record<string, unknown> = {};
    if (name !== undefined || first_name !== undefined || last_name !== undefined)
      updates.name = derivedName || null;
    if (first_name !== undefined) updates.first_name = first_name || null;
    if (last_name !== undefined) updates.last_name = last_name || null;
    if (salutation !== undefined) updates.salutation = salutation || null;
    if (company_name !== undefined) updates.company_name = company_name || null;
    if (phone !== undefined) updates.phone = phone || null;
    if (email !== undefined) updates.email = email || null;
    if (domain !== undefined) updates.domain = domain || null;
    if (direct_number !== undefined) updates.direct_number = direct_number || null;
    if (company_number !== undefined) updates.company_number = company_number || null;
    if (phone_number_link !== undefined) updates.phone_number_link = phone_number_link || null;
    if (job_title !== undefined) updates.job_title = job_title || null;
    if (job_level !== undefined) updates.job_level = job_level || null;
    if (department !== undefined) updates.department = department || null;
    if (job_function !== undefined) updates.job_function = job_function || null;
    if (job_title_link !== undefined) updates.job_title_link = job_title_link || null;
    if (tenurity !== undefined) updates.tenurity = tenurity || null;
    if (vv_status !== undefined) updates.vv_status = vv_status || null;
    if (email_status !== undefined) updates.email_status = email_status || null;
    if (ev_tool !== undefined) updates.ev_tool = ev_tool || null;
    if (address !== undefined) updates.address = address || null;
    if (city !== undefined) updates.city = city || null;
    if (state !== undefined) updates.state = state || null;
    if (country !== undefined) updates.country = country || null;
    if (zip_code !== undefined) updates.zip_code = zip_code || null;
    if (employee_size !== undefined) updates.employee_size = employee_size || null;
    if (see_all_employees !== undefined) updates.see_all_employees = see_all_employees || null;
    if (industry !== undefined) updates.industry = industry || null;
    if (employee_size_link !== undefined) updates.employee_size_link = employee_size_link || null;
    if (company_website_link !== undefined) updates.company_website_link = company_website_link || null;
    if (revenue_range !== undefined) updates.revenue_range = revenue_range || null;
    if (revenue_link !== undefined) updates.revenue_link = revenue_link || null;
    if (sic_code !== undefined) updates.sic_code = sic_code || null;
    if (sic_code_link !== undefined) updates.sic_code_link = sic_code_link || null;
    if (naics_code !== undefined) updates.naics_code = naics_code || null;
    if (naics_code_link !== undefined) updates.naics_code_link = naics_code_link || null;
    if (founded_years !== undefined)
      updates.founded_years =
        founded_years !== null && founded_years !== "" ? Number(founded_years) : null;
    if (founded_years_link !== undefined) updates.founded_years_link = founded_years_link || null;
    if (contact_linkedin_url !== undefined) updates.contact_linkedin_url = contact_linkedin_url || null;
    if (company_linkedin_url !== undefined) updates.company_linkedin_url = company_linkedin_url || null;
    if (scored !== undefined) updates.scored = scored || null;
    if (scored_timezone !== undefined) updates.scored_timezone = scored_timezone || null;
    if (appointment !== undefined) updates.appointment = appointment || null;
    if (appointment_timezone !== undefined) updates.appointment_timezone = appointment_timezone || null;
    if (lead_type !== undefined) {
      const normalizedLeadType =
        typeof lead_type === "string" ? lead_type.trim() || null : null;
      if (!normalizedLeadType) {
        return NextResponse.json({ error: "Lead type is required" }, { status: 400 });
      }
      updates.lead_type = normalizedLeadType;
    }
    if (lead_tagging !== undefined) {
      updates.lead_tagging = normalizeLeadTaggingValue(
        typeof lead_tagging === "string" ? lead_tagging : null
      );
    }
    if (ra_comment !== undefined) updates.ra_comment = ra_comment || null;
    if (special_comments !== undefined) updates.special_comments = special_comments || null;
    if (call_back !== undefined) updates.call_back = call_back || null;
    if (call_notes !== undefined) updates.call_notes = call_notes || null;
    if (primary_reason !== undefined) updates.primary_reason = primary_reason || null;
    if (secondary_reason !== undefined) updates.secondary_reason = secondary_reason || null;
    if (cq1 !== undefined) updates.cq1 = cq1 || null;
    if (cq2 !== undefined) updates.cq2 = cq2 || null;
    if (cq3 !== undefined) updates.cq3 = cq3 || null;
    if (cq4 !== undefined) updates.cq4 = cq4 || null;
    if (cq5 !== undefined) updates.cq5 = cq5 || null;
    if (extra_cq !== undefined) updates.extra_cq = normalizeExtraCq(extra_cq) ?? {};
    if (audit_date !== undefined) updates.audit_date = audit_date || null;
    if (qa_name !== undefined) updates.qa_name = qa_name || null;
    if (asset_title !== undefined) updates.asset_title = asset_title || null;
    if (status !== undefined && typeof status === "string" && status.length > 0) updates.status = status;
    if (followup_date !== undefined) updates.followup_date = followup_date || null;
    if (notes !== undefined) updates.notes = notes || null;
    if (billable_status !== undefined) {
      if (billable_status === null || billable_status === "") {
        updates.billable_status = null;
      } else {
        const normalized = normalizeBillableStatus(billable_status);
        if (!normalized) {
          return NextResponse.json({ error: "Invalid billable_status" }, { status: 400 });
        }
        updates.billable_status = normalized;
      }
    }

    for (const key of Object.keys(updates)) {
      if (AGENT_READONLY_LEAD_FIELD_SET.has(key)) {
        delete updates[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const callLogsCtx = await resolveCallLogsLeadContext({
      mainDb: supabase,
      userId: user.id,
      userEmail: user.email,
      orgId,
      campaignId,
    });
    if (callLogsCtx instanceof NextResponse) return callLogsCtx;
    if (callLogsCtx) {
      const result = await updateCallLogsLead(callLogsCtx, String(leadRowId), updates);
      if ("duplicate" in result) return buildDuplicateLeadResponse(result.duplicate);
      if ("notFound" in result) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    const { data: updated, error: updateError } = await supabase.rpc(
      "agent_update_campaign_lead" as never,
      {
        p_campaign_id: campaignId,
        p_lead_id: leadRowId,
        p_payload: updates,
      } as never
    );

    if (updateError) {
      if (updateError.code === "23505") {
        return buildDuplicateLeadResponse();
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    const updatedResult = (updated ?? null) as
      | {
          not_found?: boolean;
          duplicate?: boolean;
          duplicate_lead_id?: string | null;
          duplicate_reason?: string | null;
          id?: string;
          lead_id?: string | null;
        }
      | null;
    if (updatedResult?.duplicate) {
      return buildDuplicateLeadResponse(updatedResult);
    }
    if (!updatedResult || updatedResult.not_found) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const updatedRow = {
      id: updatedResult.id ?? String(leadRowId),
      lead_id: updatedResult.lead_id ?? null,
    };
    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: "agent",
      category: "leads",
      eventType: "lead_updated",
      description: `Updated lead ${updatedRow.lead_id ?? updatedRow.id} (${Object.keys(updates).length} fields)`,
      targetType: "lead",
      targetId: updatedRow.id,
      targetLabel: updatedRow.lead_id,
      metadata: { campaign_id: campaignId, changed_fields: Object.keys(updates) },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Agent leads update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

