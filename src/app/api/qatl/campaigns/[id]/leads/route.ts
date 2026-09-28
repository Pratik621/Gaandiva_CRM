import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { normalizeExtraCq } from "@/lib/extra-cq";
import {
  shouldStampQaAuditor,
  stampQaAuditorOnLeadUpdate,
} from "@/lib/qa-audit-attribution";
import { appendQaAuditLeadHistory } from "@/lib/qa-audit-history";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { normalizeLeadTaggingValue } from "@/lib/lead-tagging";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

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
    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const useAdminDataClient =
      roleNames.includes("qa_tl") || roleNames.includes("admin");
    const admin = useAdminDataClient ? getAdminClientSafe() : null;
    if (useAdminDataClient && !admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    const dataClient = admin ?? supabase;

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign ID required" },
        { status: 400 }
      );
    }

    const { data: campaign } = await dataClient
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .single();

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
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
      channel,
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
      qa_status,
      disqualification_reasons,
      disqualification_reason,
      rectified_reason,
      lead_disposition,
      followup_date,
      notes,
      delivery_status,
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
    if (channel !== undefined) {
      const raw = typeof channel === "string" ? channel.trim().toLowerCase() : "";
      if (!raw) {
        updates.channel = null;
      } else if (raw === "email") {
        updates.channel = "Email";
      } else if (raw === "telemarketing") {
        updates.channel = "Telemarketing";
      } else {
        return NextResponse.json({ error: "Invalid channel. Use Email or Telemarketing" }, { status: 400 });
      }
    }
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
    if (qa_comments !== undefined) updates.qa_comments = qa_comments || null;
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
    if (lead_disposition !== undefined) updates.lead_disposition = lead_disposition || null;
    if (followup_date !== undefined) updates.followup_date = followup_date || null;
    if (notes !== undefined) updates.notes = notes || null;
    if (qa_status !== undefined) {
      updates.qa_status = qa_status && typeof qa_status === "string" ? qa_status : null;
    }
    if (disqualification_reasons !== undefined) {
      const val = Array.isArray(disqualification_reasons)
        ? disqualification_reasons.filter((v) => v != null && String(v).trim()).map((v) => String(v).trim()).join(", ")
        : typeof disqualification_reasons === "string"
        ? disqualification_reasons.trim() || null
        : null;
      updates.disqualification_reasons = val;
    }
    if (disqualification_reason !== undefined) {
      updates.disqualification_reason = disqualification_reason != null && String(disqualification_reason).trim() ? String(disqualification_reason).trim() : null;
    }
    if (rectified_reason !== undefined) {
      updates.rectified_reason = rectified_reason != null && String(rectified_reason).trim() ? String(rectified_reason).trim() : null;
    }
    if (delivery_status !== undefined) {
      const raw = typeof delivery_status === "string" ? delivery_status.trim().toLowerCase() : "";
      if (raw === "delivered") {
        updates.delivery_status = "delivered";
      } else if (raw === "not_delivered" || raw === "not delivered") {
        updates.delivery_status = "not_delivered";
        (updates as Record<string, unknown>).delivered_at = null;
        (updates as Record<string, unknown>).delivered_by = null;
      } else if (raw === "pending") {
        updates.delivery_status = "pending";
        (updates as Record<string, unknown>).delivered_at = null;
        (updates as Record<string, unknown>).delivered_by = null;
      } else {
        return NextResponse.json({ error: "Invalid delivery_status" }, { status: 400 });
      }
    }

    const canEditQa = roleNames.includes("qa");
    const canEditDelivery = roleNames.includes("qa_tl");
    let previousQaStatus: string | null = null;
    let previousDeliveryStatus: string | null = null;
    let qaHistoryContext: {
      existing: {
        qa_status: string | null;
        qa_comments: string | null;
        audit_date: string | null;
        disqualification_reasons: string | null;
        disqualification_reason: string | null;
        rectified_reason: string | null;
        qa_audited_by_id: string | null;
        qa_audited_at: string | null;
        qa_name: string | null;
      };
      stamped: boolean;
      auditorLabel: string;
    } | null = null;

    if (!canEditQa) {
      delete updates.qa_status;
      delete updates.qa_comments;
      delete updates.audit_date;
      delete updates.qa_name;
      delete updates.qa_audited_by_id;
      delete updates.qa_audited_at;
      delete updates.disqualification_reasons;
      delete updates.disqualification_reason;
      delete updates.rectified_reason;
    } else {
      delete updates.qa_name;
      delete updates.qa_audited_by_id;
      delete updates.qa_audited_at;

      const { data: existingLead } = await dataClient
        .from("leads")
        .select(
          "qa_status, qa_comments, audit_date, disqualification_reasons, disqualification_reason, rectified_reason, qa_audited_by_id, qa_audited_at, qa_name"
        )
        .eq("id", leadRowId)
        .eq("campaign_id", campaignId)
        .maybeSingle();

      const existing = (existingLead ?? {}) as {
        qa_status: string | null;
        qa_comments: string | null;
        audit_date: string | null;
        disqualification_reasons: string | null;
        disqualification_reason: string | null;
        rectified_reason: string | null;
        qa_audited_by_id: string | null;
        qa_audited_at: string | null;
        qa_name: string | null;
      };
      previousQaStatus = existing.qa_status;

      let qaStamped = false;
      let qaAuditorLabel = "";
      if (shouldStampQaAuditor(existing, updates)) {
        qaStamped = true;
        await stampQaAuditorOnLeadUpdate(updates, user.id, async () => {
          const { data: userProfile } = await supabase
            .from("users")
            .select("full_name, email")
            .eq("id", user.id)
            .single();
          const profile = userProfile as {
            full_name: string | null;
            email: string | null;
          } | null;
          qaAuditorLabel =
            profile?.full_name?.trim() || profile?.email?.trim() || "";
          return profile;
        });
      }

      if (qaStamped) {
        qaHistoryContext = {
          existing,
          stamped: true,
          auditorLabel: qaAuditorLabel || existing.qa_name?.trim() || "",
        };
      }
    }
    if (delivery_status !== undefined && !canEditDelivery) {
      return NextResponse.json({ error: "Only QA TL can update delivery status" }, { status: 403 });
    }

    if (updates.delivery_status !== undefined) {
      const { data: existingLead, error: existingError } = (await dataClient
        .from("leads")
        .select("id, delivery_status, delivered_at, delivered_by")
        .eq("id", leadRowId)
        .eq("campaign_id", campaignId)
        .maybeSingle()) as {
          data: {
            id: string;
            delivery_status: string | null;
            delivered_at: string | null;
            delivered_by: string | null;
          } | null;
          error: { message: string } | null;
        };
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }
      if (!existingLead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      previousDeliveryStatus = existingLead.delivery_status;
      const alreadyDelivered =
        existingLead.delivery_status === "delivered" && updates.delivery_status === "delivered";
      const missingDeliveredAt = !existingLead.delivered_at;
      const missingDeliveredBy = !existingLead.delivered_by;

      // Block re-delivery only when both timestamp and QA TL user are already recorded.
      if (alreadyDelivered && !missingDeliveredAt && !missingDeliveredBy) {
        return NextResponse.json({ error: "Lead is already marked as delivered" }, { status: 409 });
      }
      if (updates.delivery_status === "delivered") {
        if (missingDeliveredAt) {
          (updates as Record<string, unknown>).delivered_at = new Date().toISOString();
        }
        if (missingDeliveredBy) {
          (updates as Record<string, unknown>).delivered_by = user.id;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await dataClient
      .from("leads")
      .update(updates as never)
      .eq("id", leadRowId)
      .eq("campaign_id", campaignId)
      .select("id, lead_id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (qaHistoryContext) {
      await appendQaAuditLeadHistory(
        dataClient,
        leadRowId,
        user.id,
        qaHistoryContext.existing,
        updates,
        qaHistoryContext.stamped,
        user.id,
        qaHistoryContext.auditorLabel
      );
    }

    const auditRole = resolvePrimaryAuditRole(roleNames);
    const leadLabel =
      (updated as { lead_id?: string | null }).lead_id ?? leadRowId;

    if (qa_status !== undefined && canEditQa) {
      const newQa = (updates.qa_status as string | null) ?? null;
      if (newQa !== previousQaStatus) {
        void logAudit({
          organizationId: orgId,
          actorId: user.id,
          actorRole: auditRole,
          category: "leads",
          eventType: "qa_status_changed",
          description: `QA status changed from ${previousQaStatus ?? "pending"} to ${newQa ?? "pending"}`,
          targetType: "lead",
          targetId: leadRowId,
          targetLabel: leadLabel,
          metadata: {
            campaign_id: campaignId,
            previous_qa_status: previousQaStatus,
            new_qa_status: newQa,
          },
          request,
        });
      }
    }

    if (delivery_status !== undefined && canEditDelivery) {
      const newDelivery = (updates.delivery_status as string | null) ?? null;
      if (newDelivery !== previousDeliveryStatus) {
        void logAudit({
          organizationId: orgId,
          actorId: user.id,
          actorRole: auditRole,
          category: "leads",
          eventType:
            newDelivery === "delivered" ? "lead_delivered" : "lead_delivery_updated",
          description:
            newDelivery === "delivered"
              ? `Marked lead as delivered`
              : `Delivery status changed from ${previousDeliveryStatus ?? "pending"} to ${newDelivery ?? "pending"}`,
          targetType: "lead",
          targetId: leadRowId,
          targetLabel: leadLabel,
          metadata: {
            campaign_id: campaignId,
            previous_delivery_status: previousDeliveryStatus,
            new_delivery_status: newDelivery,
          },
          request,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("QATL leads update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
