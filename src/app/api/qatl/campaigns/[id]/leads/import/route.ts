import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import {
  finalizeImportedLeadRow,
  LEAD_IMPORT_PHONE_FIELD_KEYS,
  normalizeImportPhoneField,
  normalizeImportTimestampField,
  pickAndSanitizeLeadImportFields,
  stripQaAuditFieldsFromImport,
} from "@/lib/lead-import-sanitize";
import {
  applyQaAuditorToImportPayload,
  buildQaUpdatesFromImportRow,
  isQaRoleForAuditImport,
  shouldStampQaAuditor,
  type ExistingLeadQaSnapshot,
} from "@/lib/qa-audit-attribution";
import { appendQaAuditLeadHistory } from "@/lib/qa-audit-history";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";
import { normalizeLeadTaggingValue } from "@/lib/lead-tagging";

export const dynamic = "force-dynamic";

const LEAD_FIELDS = [
  "name", "first_name", "last_name", "salutation", "company_name", "phone", "email", "domain",
  "direct_number", "company_number", "phone_number_link", "job_title", "job_level", "department",
  "job_function", "job_title_link", "tenurity", "vv_status", "email_status", "ev_tool",
  "address", "address2", "address_link", "city", "state", "country", "zip_code", "employee_size",
  "actual_employee_size", "see_all_employees",
  "industry", "industry_type_link", "channel", "employee_size_link", "company_website_link",
  "revenue_range", "revenue_link",
  "sic_code", "sic_code_link", "naics_code", "naics_code_link", "founded_years", "founded_years_link",
  "contact_linkedin_url", "company_linkedin_url", "scored", "scored_timezone", "appointment", "appointment_timezone", "lead_tagging", "ra_comment", "special_comments", "call_back",
  "call_notes", "primary_reason", "secondary_reason", "qa_comments", "cq1", "cq2", "cq3", "cq4", "cq5",
  "audit_date", "qa_name", "asset_title", "asset_title2", "status", "qa_status", "disqualification_reasons",
  "disqualification_reason", "rectified_reason", "rectification_status", "rectification_qa_name",
  "rectification_date", "lead_disposition", "followup_date", "notes", "delivery_status",
  "delivery_remark", "delivered_at",
] as const;

function getChannelCandidates(channel: string | null): (string | null)[] {
  if (!channel) return [null];
  const lower = channel.toLowerCase();
  if (lower === "email") return ["Email", "email"];
  if (lower === "telemarketing") return ["Telemarketing", "telemarketing"];
  return [channel];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const isQaImporter = isQaRoleForAuditImport(roleNames);
    let qaAuditorLabel: string | null = null;
    if (isQaImporter) {
      const { data: qaProfile } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", user.id)
        .single();
      const qp = qaProfile as { full_name: string | null; email: string | null } | null;
      qaAuditorLabel = qp?.full_name?.trim() || qp?.email?.trim() || null;
    }
    const canImport = roleNames.includes("qa_tl") || roleNames.includes("admin");
    const canEditDelivery = roleNames.includes("qa_tl");
    if (!canImport) {
      return NextResponse.json({ error: "You do not have permission to import leads" }, { status: 403 });
    }
    // QA TL/Admin bulk import must bypass leads RLS (QA has UPDATE but no INSERT policy on user JWT).
    const useAdminDataClient =
      roleNames.includes("qa_tl") || roleNames.includes("admin") || isQaImporter;
    const admin = useAdminDataClient ? getAdminClientSafe() : null;
    if (useAdminDataClient && !admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    const dataClient = admin ?? supabase;

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const { data: campaign } = await dataClient
      .from("campaigns")
      .select("id, name")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const body = await request.json();
    const rawLeads = Array.isArray(body?.leads) ? body.leads : [];
    if (rawLeads.length === 0) {
      return NextResponse.json({ error: "No leads to import" }, { status: 400 });
    }
    if (rawLeads.length > 500) {
      return NextResponse.json({ error: "Maximum 500 leads per import" }, { status: 400 });
    }

    const { data: assignments } = await dataClient
      .from("campaign_assignments")
      .select("agent_id")
      .eq("campaign_id", campaignId)
      .eq("is_active", true)
      .limit(1);
    const firstAgentId = (assignments?.[0] as { agent_id: string } | undefined)?.agent_id ?? null;

    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    const importRowIds: string[] = [];
    for (let i = 0; i < rawLeads.length; i++) {
      const row = rawLeads[i] as Record<string, unknown>;
      const rowIdRaw = row["id"] as string | number | undefined;
      const id = rowIdRaw != null ? String(rowIdRaw).trim() : "";
      if (id) importRowIds.push(id);
    }

    const existingQaByLeadId = new Map<string, ExistingLeadQaSnapshot>();
    const existingDeliveryByLeadId = new Map<
      string,
      { delivery_status: string | null; delivered_at: string | null; delivered_by: string | null }
    >();
    if (importRowIds.length > 0) {
      const { data: existingRows, error: existingErr } = await dataClient
        .from("leads")
        .select(
          "id, qa_status, qa_comments, audit_date, disqualification_reasons, disqualification_reason, rectified_reason, rectification_status, rectification_qa_name, rectification_date, qa_audited_by_id, qa_audited_at, qa_name, delivery_status, delivered_at, delivered_by"
        )
        .eq("campaign_id", campaignId)
        .eq("organization_id", orgId)
        .in("id", importRowIds);
      if (existingErr) {
        return NextResponse.json({ error: existingErr.message }, { status: 500 });
      }
      for (const row of existingRows ?? []) {
        const r = row as ExistingLeadQaSnapshot & {
          id: string;
          delivery_status: string | null;
          delivered_at: string | null;
          delivered_by: string | null;
        };
        existingQaByLeadId.set(r.id, r);
        existingDeliveryByLeadId.set(r.id, {
          delivery_status: r.delivery_status,
          delivered_at: r.delivered_at,
          delivered_by: r.delivered_by,
        });
      }
    }

    for (let i = 0; i < rawLeads.length; i++) {
      const row = finalizeImportedLeadRow(
        rawLeads[i] as Record<string, unknown>
      );
      const rowIdRaw = row["id"] as string | number | undefined;
      let rowId = rowIdRaw != null ? String(rowIdRaw).trim() : "";
      const rowLeadIdRaw = row["lead_id"] as string | number | undefined;
      const rowLeadId = rowLeadIdRaw != null ? String(rowLeadIdRaw).trim() : "";

      // If no UUID id but lead_id is present, resolve it to the internal id
      if (!rowId && rowLeadId) {
        const { data: byLeadId, error: lookupErr } = await dataClient
          .from("leads")
          .select("id")
          .eq("lead_id", rowLeadId)
          .eq("campaign_id", campaignId)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (lookupErr) {
          errors.push(`Row ${i + 1}: ${lookupErr.message}`);
          continue;
        }
        rowId = (byLeadId as { id: string } | null)?.id ?? "";
        if (!rowId) {
          errors.push(
            `Row ${i + 1}: Lead not found (${rowLeadId}). Export leads first and keep the lead_id column when editing.`
          );
          continue;
        }
      }

      const fields = pickAndSanitizeLeadImportFields(row, LEAD_FIELDS);
      if (!isQaImporter) {
        stripQaAuditFieldsFromImport(fields);
      }
      const first_name = ((fields.first_name as string) ?? (fields.name as string)?.split(/\s+/)[0]) ?? null;
      const last_name = ((fields.last_name as string) ?? (fields.name as string)?.split(/\s+/).slice(1).join(" ")) || null;
      const derivedName = [first_name, last_name].filter(Boolean).join(" ").trim() || (fields.name as string) || null;

      const leadStatus = typeof fields.status === "string" && fields.status.length > 0 ? fields.status : "new";
      const deliveryStatusRaw = typeof fields.delivery_status === "string" ? fields.delivery_status.trim().toLowerCase() : "";
      const normalizedDeliveryStatus =
        canEditDelivery && deliveryStatusRaw === "delivered"
          ? "delivered"
          : canEditDelivery &&
            (deliveryStatusRaw === "not_delivered" || deliveryStatusRaw === "not delivered")
          ? "not_delivered"
          : canEditDelivery && deliveryStatusRaw === "pending"
          ? "pending"
          : null;
      // QA TL file upload = client delivery; default to delivered unless the file specifies otherwise.
      const effectiveDeliveryStatus = canEditDelivery
        ? normalizedDeliveryStatus ?? "delivered"
        : normalizedDeliveryStatus;
      const deliveredAtFromCsv = normalizeImportTimestampField(fields.delivered_at);
      const existingDelivery = rowId ? existingDeliveryByLeadId.get(rowId) : undefined;
      const resolvedDeliveredAt =
        effectiveDeliveryStatus === "delivered"
          ? deliveredAtFromCsv ??
            existingDelivery?.delivered_at ??
            new Date().toISOString()
          : effectiveDeliveryStatus === "not_delivered" || effectiveDeliveryStatus === "pending"
          ? null
          : undefined;
      const resolvedDeliveredBy =
        effectiveDeliveryStatus === "delivered"
          ? existingDelivery?.delivered_by ?? user.id
          : effectiveDeliveryStatus === "not_delivered" || effectiveDeliveryStatus === "pending"
          ? null
          : undefined;
      const channelRaw = typeof fields.channel === "string" ? fields.channel.trim().toLowerCase() : "";
      const normalizedChannel =
        channelRaw === "email"
          ? "Email"
          : channelRaw === "telemarketing"
          ? "Telemarketing"
          : null;
      const channelCandidates = getChannelCandidates(normalizedChannel);

      const upsertPayload = {
        name: derivedName || null,
        first_name: first_name || null,
        last_name: last_name || null,
        salutation: fields.salutation || null,
        company_name: fields.company_name || null,
        phone: normalizeImportPhoneField(fields.phone),
        email: fields.email || null,
        domain: fields.domain || null,
        direct_number: normalizeImportPhoneField(fields.direct_number),
        company_number: normalizeImportPhoneField(fields.company_number),
        phone_number_link: fields.phone_number_link || null,
        job_title: fields.job_title || null,
        job_level: fields.job_level || null,
        department: fields.department || null,
        job_function: fields.job_function || null,
        job_title_link: fields.job_title_link || null,
        tenurity: fields.tenurity || null,
        vv_status: fields.vv_status || null,
        email_status: fields.email_status || null,
        ev_tool: fields.ev_tool || null,
        address: fields.address || null,
        address2: fields.address2 || null,
        address_link: fields.address_link || null,
        city: fields.city || null,
        state: fields.state || null,
        country: fields.country || null,
        zip_code: fields.zip_code || null,
        employee_size: fields.employee_size || null,
        actual_employee_size: fields.actual_employee_size || null,
        see_all_employees: fields.see_all_employees || null,
        industry: fields.industry || null,
        industry_type_link: fields.industry_type_link || null,
        channel: normalizedChannel,
        employee_size_link: fields.employee_size_link || null,
        company_website_link: fields.company_website_link || null,
        revenue_range: fields.revenue_range || null,
        revenue_link: fields.revenue_link || null,
        sic_code: fields.sic_code || null,
        sic_code_link: fields.sic_code_link || null,
        naics_code: fields.naics_code || null,
        naics_code_link: fields.naics_code_link || null,
        founded_years:
          typeof fields.founded_years === "number" ? fields.founded_years : null,
        founded_years_link: fields.founded_years_link || null,
        contact_linkedin_url: fields.contact_linkedin_url || null,
        company_linkedin_url: fields.company_linkedin_url || null,
        scored: fields.scored || null,
        scored_timezone: fields.scored_timezone || null,
        appointment: fields.appointment || null,
        appointment_timezone: fields.appointment_timezone || null,
        lead_tagging:
          "lead_tagging" in fields
            ? typeof fields.lead_tagging === "string"
              ? normalizeLeadTaggingValue(fields.lead_tagging)
              : null
            : undefined,
        ra_comment: fields.ra_comment || null,
        special_comments: fields.special_comments || null,
        call_back: fields.call_back || null,
        call_notes: fields.call_notes || null,
        primary_reason: fields.primary_reason || null,
        secondary_reason: fields.secondary_reason || null,
        cq1: fields.cq1 || null,
        cq2: fields.cq2 || null,
        cq3: fields.cq3 || null,
        cq4: fields.cq4 || null,
        cq5: fields.cq5 || null,
        asset_title: fields.asset_title || null,
        asset_title2: fields.asset_title2 || null,
        status: leadStatus,
        lead_disposition: fields.lead_disposition || null,
        followup_date: fields.followup_date || null,
        notes: fields.notes || null,
        ...(effectiveDeliveryStatus != null
          ? { delivery_status: effectiveDeliveryStatus }
          : {}),
        ...(resolvedDeliveredAt !== undefined ? { delivered_at: resolvedDeliveredAt } : {}),
        ...(resolvedDeliveredBy !== undefined ? { delivered_by: resolvedDeliveredBy } : {}),
      } as Record<string, unknown>;

      Object.assign(upsertPayload, buildQaUpdatesFromImportRow(fields));
      if (!isQaImporter && "qa_name" in fields) {
        upsertPayload.qa_name = fields.qa_name || null;
      }

      let qaStamped = false;
      if (isQaImporter && qaAuditorLabel) {
        let existingQa = rowId ? existingQaByLeadId.get(rowId) : undefined;
        if (rowId && !existingQa) {
          const { data: oneLead } = await dataClient
            .from("leads")
            .select(
              "id, qa_status, qa_comments, audit_date, disqualification_reasons, disqualification_reason, rectified_reason, rectification_status, rectification_qa_name, rectification_date, qa_audited_by_id, qa_audited_at, qa_name"
            )
            .eq("id", rowId)
            .eq("campaign_id", campaignId)
            .eq("organization_id", orgId)
            .maybeSingle();
          existingQa = (oneLead ?? {}) as ExistingLeadQaSnapshot;
          existingQaByLeadId.set(rowId, existingQa);
        }
        const existingSnapshot = existingQa ?? {};
        qaStamped = applyQaAuditorToImportPayload(
          upsertPayload,
          existingSnapshot,
          fields,
          user.id,
          qaAuditorLabel
        );
      }

      // If CSV has existing id, update that lead; otherwise create new one
      if (rowId) {
        if (effectiveDeliveryStatus == null) {
          delete upsertPayload.delivery_status;
          delete upsertPayload.delivered_at;
          delete upsertPayload.delivered_by;
        }
        let updateError: { message: string } | null = null;
        for (const candidateChannel of channelCandidates) {
          const payload = { ...upsertPayload, channel: candidateChannel } as Record<string, unknown>;
          for (const key of LEAD_IMPORT_PHONE_FIELD_KEYS) {
            if (!(key in fields)) delete payload[key];
          }
          const { error } = await dataClient
            .from("leads")
            .update(payload as never)
            .eq("id", rowId)
            .eq("campaign_id", campaignId)
            .eq("organization_id", orgId);
          updateError = error as { message: string } | null;
          if (!updateError) break;
          if (!updateError.message?.includes("leads_channel_check")) break;
        }

        if (updateError) {
          errors.push(`Row ${i + 1}: ${updateError.message}`);
        } else {
          updated++;
          const qaImportUpdates = buildQaUpdatesFromImportRow(fields);
          const existingForHistory = existingQaByLeadId.get(rowId) ?? {};
          if (
            isQaImporter &&
            qaAuditorLabel &&
            shouldStampQaAuditor(existingForHistory, qaImportUpdates)
          ) {
            await appendQaAuditLeadHistory(
              dataClient,
              rowId,
              user.id,
              existingForHistory,
              upsertPayload,
              qaStamped,
              user.id,
              qaAuditorLabel
            );
          }
        }
      } else {
        if (
          !derivedName &&
          !fields.company_name &&
          !fields.email &&
          !normalizeImportPhoneField(fields.phone)
        ) {
          errors.push(`Row ${i + 1}: At least one of name, company, email, or phone is required`);
          continue;
        }

        let insertError: { message: string } | null = null;
        for (const candidateChannel of channelCandidates) {
          const { error } = await dataClient
            .from("leads")
            .insert({
              organization_id: orgId,
              campaign_id: campaignId,
              assigned_agent_id: firstAgentId,
              ...upsertPayload,
              delivery_status: effectiveDeliveryStatus ?? "not_delivered",
              delivered_at:
                effectiveDeliveryStatus === "delivered"
                  ? (resolvedDeliveredAt as string)
                  : null,
              delivered_by:
                effectiveDeliveryStatus === "delivered" ? user.id : null,
              channel: candidateChannel,
              created_by: user.id,
            } as never);
          insertError = error as { message: string } | null;
          if (!insertError) break;
          if (!insertError.message?.includes("leads_channel_check")) break;
        }

        if (insertError) {
          errors.push(`Row ${i + 1}: ${insertError.message}`);
        } else {
          created++;
        }
      }
    }

    const campaignRow = campaign as { id: string; name?: string | null };
    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "leads",
      eventType: "bulk_lead_import",
      description: `Bulk imported ${rawLeads.length} lead row(s): ${created} created, ${updated} updated`,
      targetType: "campaign",
      targetId: campaignId,
      targetLabel: campaignRow.name ?? campaignId,
      metadata: {
        total_rows: rawLeads.length,
        created,
        updated,
        error_count: errors.length,
        is_qa_importer: isQaImporter,
        can_edit_delivery: canEditDelivery,
      },
      request,
    });

    return NextResponse.json({ created, updated, total: rawLeads.length, errors });
  } catch (err) {
    console.error("QATL leads import error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
