import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AGENT_READONLY_LEAD_FIELDS } from "@/lib/agent-lead-fields";
import {
  finalizeImportedLeadRow,
  LEAD_IMPORT_PHONE_FIELD_KEYS,
  normalizeImportPhoneField,
  pickAndSanitizeLeadImportFields,
} from "@/lib/lead-import-sanitize";
import { normalizeLeadTaggingValue } from "@/lib/lead-tagging";
import { importCallLogsLeads, resolveCallLogsLeadContext } from "@/lib/call-logs-leads";

export const dynamic = "force-dynamic";

const AGENT_IMPORT_FIELDS = [
  "name",
  "first_name",
  "last_name",
  "salutation",
  "company_name",
  "phone",
  "email",
  "domain",
  "direct_number",
  "company_number",
  "phone_number_link",
  "job_title",
  "job_level",
  "department",
  "job_function",
  "job_title_link",
  "tenurity",
  "vv_status",
  "address",
  "address2",
  "address_link",
  "city",
  "state",
  "country",
  "zip_code",
  "employee_size",
  "actual_employee_size",
  "see_all_employees",
  "industry",
  "industry_type_link",
  "employee_size_link",
  "asset_title2",
  "company_website_link",
  "revenue_range",
  "revenue_link",
  "sic_code",
  "sic_code_link",
  "naics_code",
  "naics_code_link",
  "founded_years",
  "founded_years_link",
  "contact_linkedin_url",
  "company_linkedin_url",
  "scored",
  "scored_timezone",
  "appointment",
  "appointment_timezone",
  "lead_type",
  "lead_tagging",
  "ra_comment",
  "special_comments",
  "call_back",
  "call_notes",
  "followup_date",
  "notes",
  "status",
] as const;

const AGENT_IMPORT_BLOCKED = new Set<string>(AGENT_READONLY_LEAD_FIELDS);

function sanitizeAgentImportRow(
  row: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...row };
  for (const key of AGENT_IMPORT_BLOCKED) {
    delete out[key];
  }
  return out;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
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
    const rawLeads = Array.isArray(body?.leads) ? body.leads : [];
    if (rawLeads.length === 0) {
      return NextResponse.json({ error: "No leads to import" }, { status: 400 });
    }
    if (rawLeads.length > 500) {
      return NextResponse.json(
        { error: "Maximum 500 leads per import" },
        { status: 400 }
      );
    }

    const sanitizedRows: Record<string, unknown>[] = [];

    for (let i = 0; i < rawLeads.length; i++) {
      const row = finalizeImportedLeadRow(
        rawLeads[i] as Record<string, unknown>
      );

      const rowIdRaw = row.id as string | number | undefined;
      const rowId = rowIdRaw != null ? String(rowIdRaw).trim() : "";
      const rowLeadIdRaw = row.lead_id as string | number | undefined;
      const rowLeadId =
        rowLeadIdRaw != null ? String(rowLeadIdRaw).trim() : "";

      const fields = pickAndSanitizeLeadImportFields(
        sanitizeAgentImportRow(row),
        AGENT_IMPORT_FIELDS
      );
      const first_name = normalizeString(fields.first_name);
      const last_name = normalizeString(fields.last_name);
      const name = normalizeString(fields.name);
      const company_name = normalizeString(fields.company_name);
      const email = normalizeString(fields.email);
      const domain = normalizeString(fields.domain);
      const phone = normalizeImportPhoneField(fields.phone);
      const direct_number = normalizeImportPhoneField(fields.direct_number);
      const company_number = normalizeImportPhoneField(fields.company_number);

      const derivedName =
        [first_name, last_name].filter(Boolean).join(" ").trim() ||
        name ||
        null;

      const leadStatus =
        typeof fields.status === "string" && fields.status.length > 0
          ? (fields.status as string)
          : "new";

      const upsertPayload: Record<string, unknown> = {
        name: derivedName || null,
        first_name,
        last_name,
        salutation: fields.salutation ?? null,
        company_name,
        phone,
        email,
        domain,
        direct_number,
        company_number,
        phone_number_link: fields.phone_number_link ?? null,
        job_title: fields.job_title ?? null,
        job_level: fields.job_level ?? null,
        department: fields.department ?? null,
        job_function: fields.job_function ?? null,
        job_title_link: fields.job_title_link ?? null,
        tenurity: fields.tenurity ?? null,
        vv_status: fields.vv_status ?? null,
        address: fields.address ?? null,
        address2: fields.address2 ?? null,
        address_link: fields.address_link ?? null,
        city: fields.city ?? null,
        state: fields.state ?? null,
        country: fields.country ?? null,
        zip_code: fields.zip_code ?? null,
        employee_size: fields.employee_size ?? null,
        actual_employee_size: fields.actual_employee_size ?? null,
        see_all_employees: fields.see_all_employees ?? null,
        industry: fields.industry ?? null,
        industry_type_link: fields.industry_type_link ?? null,
        employee_size_link: fields.employee_size_link ?? null,
        asset_title2: fields.asset_title2 ?? null,
        company_website_link: fields.company_website_link ?? null,
        revenue_range: fields.revenue_range ?? null,
        revenue_link: fields.revenue_link ?? null,
        sic_code: fields.sic_code ?? null,
        sic_code_link: fields.sic_code_link ?? null,
        naics_code: fields.naics_code ?? null,
        naics_code_link: fields.naics_code_link ?? null,
        founded_years:
          fields.founded_years != null ? Number(fields.founded_years) : null,
        founded_years_link: fields.founded_years_link ?? null,
        contact_linkedin_url: fields.contact_linkedin_url ?? null,
        company_linkedin_url: fields.company_linkedin_url ?? null,
        scored: fields.scored ?? null,
        scored_timezone: fields.scored_timezone ?? null,
        appointment: fields.appointment ?? null,
        appointment_timezone: fields.appointment_timezone ?? null,
        lead_type: fields.lead_type ?? null,
        ra_comment: fields.ra_comment ?? null,
        special_comments: fields.special_comments ?? null,
        call_back: fields.call_back ?? null,
        call_notes: fields.call_notes ?? null,
        followup_date: fields.followup_date ?? null,
        notes: fields.notes ?? null,
        status: leadStatus,
      };

      // Only write lead_tagging when the spreadsheet provided it (or
      // finalizeImportedLeadRow salvaged/defaulted it onto `fields`).
      if ("lead_tagging" in fields) {
        const tagging =
          typeof fields.lead_tagging === "string"
            ? normalizeLeadTaggingValue(fields.lead_tagging)
            : null;
        upsertPayload.lead_tagging = tagging;
      }

      const rpcRow: Record<string, unknown> = {
        ...upsertPayload,
      };
      if (rowId) rpcRow.id = rowId;
      if (rowLeadId) rpcRow.lead_id = rowLeadId;
      for (const key of LEAD_IMPORT_PHONE_FIELD_KEYS) {
        if (!(key in fields)) delete rpcRow[key];
      }
      if (derivedName !== null) {
        rpcRow.name = derivedName;
      }
      sanitizedRows.push(rpcRow);
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
      return NextResponse.json(await importCallLogsLeads(callLogsCtx, sanitizedRows));
    }

    const { data: importResult, error: importError } = await supabase.rpc(
      "agent_import_campaign_leads" as never,
      {
        p_campaign_id: campaignId,
        p_rows: sanitizedRows,
      } as never
    );

    if (importError) {
      if (importError.code === "23505") {
        return NextResponse.json(
          {
            created: 0,
            updated: 0,
            total: rawLeads.length,
            duplicates: rawLeads.length,
            duplicate_rows: [],
            errors: ["Duplicate lead. This lead already exists in this campaign."],
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: importError.message }, { status: 500 });
    }

    const result = (importResult ?? {}) as {
      created?: number;
      updated?: number;
      total?: number;
      duplicates?: number;
      duplicate_rows?: unknown[];
      errors?: string[];
    };

    return NextResponse.json({
      created: result.created ?? 0,
      updated: result.updated ?? 0,
      total: result.total ?? rawLeads.length,
      duplicates: result.duplicates ?? 0,
      duplicate_rows: result.duplicate_rows ?? [],
      errors: result.errors ?? [],
    });
  } catch (err) {
    console.error("Agent leads import error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
