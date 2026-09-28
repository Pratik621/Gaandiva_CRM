/**
 * Maps form values to lead API payload and lead to form values
 */

import dayjs from "dayjs";
import { extraCqToFormValues, normalizeExtraCq } from "@/lib/extra-cq";
import { getDefaultLeadTimezone } from "@/lib/lead-timezone-catalog";
import {
  utcIsoToWallClockDayjs,
  wallClockDayjsToUtcIso,
} from "@/lib/timezones";

export function leadToFormValues(lead: Record<string, unknown>): Record<string, unknown> {
  const appointmentTz =
    (typeof lead.appointment_timezone === "string" && lead.appointment_timezone) ||
    getDefaultLeadTimezone();
  const scoredTz =
    (typeof lead.scored_timezone === "string" && lead.scored_timezone) ||
    getDefaultLeadTimezone();

  return {
    name: lead.name ?? undefined,
    first_name: lead.first_name ?? undefined,
    last_name: lead.last_name ?? undefined,
    salutation: lead.salutation ?? undefined,
    company_name: lead.company_name ?? undefined,
    phone: lead.phone ?? undefined,
    email: lead.email ?? undefined,
    domain: lead.domain ?? undefined,
    direct_number: lead.direct_number ?? undefined,
    company_number: lead.company_number ?? undefined,
    phone_number_link: lead.phone_number_link ?? undefined,
    job_title: lead.job_title ?? undefined,
    job_level: lead.job_level ?? undefined,
    department: lead.department ?? undefined,
    job_function: lead.job_function ?? undefined,
    job_title_link: lead.job_title_link ?? undefined,
    tenurity: lead.tenurity ?? undefined,
    vv_status: lead.vv_status ?? undefined,
    email_status: lead.email_status ?? undefined,
    ev_tool: lead.ev_tool ?? undefined,
    address: lead.address ?? undefined,
    city: lead.city ?? undefined,
    state: lead.state ?? undefined,
    country: lead.country ?? undefined,
    zip_code: lead.zip_code ?? undefined,
    employee_size: lead.employee_size ?? undefined,
    see_all_employees: lead.see_all_employees ?? undefined,
    industry: lead.industry ?? undefined,
    employee_size_link: lead.employee_size_link ?? undefined,
    company_website_link: lead.company_website_link ?? undefined,
    revenue_range: lead.revenue_range ?? undefined,
    revenue_link: lead.revenue_link ?? undefined,
    sic_code: lead.sic_code ?? undefined,
    sic_code_link: lead.sic_code_link ?? undefined,
    naics_code: lead.naics_code ?? undefined,
    naics_code_link: lead.naics_code_link ?? undefined,
    founded_years: lead.founded_years != null ? String(lead.founded_years) : undefined,
    founded_years_link: lead.founded_years_link ?? undefined,
    contact_linkedin_url: lead.contact_linkedin_url ?? undefined,
    company_linkedin_url: lead.company_linkedin_url ?? undefined,
    scored: utcIsoToWallClockDayjs(lead.scored as string | null | undefined, scoredTz),
    scored_timezone: scoredTz,
    appointment: utcIsoToWallClockDayjs(lead.appointment as string | null | undefined, appointmentTz),
    appointment_timezone: appointmentTz,
    lead_type: lead.lead_type ?? undefined,
    lead_tagging: lead.lead_tagging ?? undefined,
    ra_comment: lead.ra_comment ?? undefined,
    special_comments: lead.special_comments ?? undefined,
    call_back: lead.call_back ?? undefined,
    call_notes: lead.call_notes ?? undefined,
    primary_reason: lead.primary_reason ?? undefined,
    secondary_reason: lead.secondary_reason ?? undefined,
    qa_comments: lead.qa_comments ?? undefined,
    cq1: lead.cq1 ?? undefined,
    cq2: lead.cq2 ?? undefined,
    cq3: lead.cq3 ?? undefined,
    cq4: lead.cq4 ?? undefined,
    cq5: lead.cq5 ?? undefined,
    extra_cq: extraCqToFormValues(lead.extra_cq),
    audit_date: lead.audit_date ? dayjs(lead.audit_date as string) : undefined,
    qa_name: lead.qa_name ?? undefined,
    asset_title: lead.asset_title ?? undefined,
    status: lead.status ?? "new",
    lead_disposition: lead.lead_disposition ?? undefined,
    followup_date: lead.followup_date ? dayjs(lead.followup_date as string) : undefined,
    notes: lead.notes ?? undefined,
    qa_status: lead.qa_status ?? undefined,
    disqualification_reasons: (lead.disqualification_reasons as string)?.trim()
      ? (lead.disqualification_reasons as string).split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    disqualification_reason: lead.disqualification_reason ?? undefined,
    rectified_reason: lead.rectified_reason ?? undefined,
  };
}

export function buildLeadPayload(values: Record<string, unknown>) {
  const firstName = values.first_name ?? "";
  const lastName = values.last_name ?? "";
  const derivedName =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    (values.name as string) ||
    null;

  return {
    name: derivedName,
    first_name: values.first_name ?? null,
    last_name: values.last_name ?? null,
    salutation: values.salutation ?? null,
    company_name: values.company_name ?? null,
    phone: values.phone ?? null,
    email: values.email ?? null,
    domain: values.domain ?? null,
    direct_number: values.direct_number ?? null,
    company_number: values.company_number ?? null,
    phone_number_link: values.phone_number_link ?? null,
    job_title: values.job_title ?? null,
    job_level: values.job_level ?? null,
    department: values.department ?? null,
    job_function: values.job_function ?? null,
    job_title_link: values.job_title_link ?? null,
    tenurity: values.tenurity ?? null,
    vv_status: values.vv_status ?? null,
    email_status: values.email_status ?? null,
    ev_tool: values.ev_tool ?? null,
    address: values.address ?? null,
    city: values.city ?? null,
    state: values.state ?? null,
    country: values.country ?? null,
    zip_code: values.zip_code ?? null,
    employee_size: values.employee_size ?? null,
    see_all_employees: values.see_all_employees ?? null,
    industry: values.industry ?? null,
    employee_size_link: values.employee_size_link ?? null,
    company_website_link: values.company_website_link ?? null,
    revenue_range: values.revenue_range ?? null,
    revenue_link: values.revenue_link ?? null,
    sic_code: values.sic_code ?? null,
    sic_code_link: values.sic_code_link ?? null,
    naics_code: values.naics_code ?? null,
    naics_code_link: values.naics_code_link ?? null,
    founded_years:
      values.founded_years != null && values.founded_years !== ""
        ? Number(values.founded_years)
        : null,
    founded_years_link: values.founded_years_link ?? null,
    contact_linkedin_url: values.contact_linkedin_url ?? null,
    company_linkedin_url: values.company_linkedin_url ?? null,
    scored: wallClockDayjsToUtcIso(
      values.scored as dayjs.Dayjs | null | undefined,
      (typeof values.scored_timezone === "string" && values.scored_timezone) ||
        getDefaultLeadTimezone(),
    ),
    scored_timezone:
      values.scored != null && dayjs.isDayjs(values.scored)
        ? (typeof values.scored_timezone === "string" && values.scored_timezone) ||
          getDefaultLeadTimezone()
        : null,
    appointment: wallClockDayjsToUtcIso(
      values.appointment as dayjs.Dayjs | null | undefined,
      (typeof values.appointment_timezone === "string" && values.appointment_timezone) ||
        getDefaultLeadTimezone(),
    ),
    appointment_timezone:
      values.appointment != null && dayjs.isDayjs(values.appointment)
        ? (typeof values.appointment_timezone === "string" && values.appointment_timezone) ||
          getDefaultLeadTimezone()
        : null,
    lead_type:
      typeof values.lead_type === "string" ? values.lead_type.trim() || null : null,
    lead_tagging: values.lead_tagging ?? null,
    ra_comment: values.ra_comment ?? null,
    special_comments: values.special_comments ?? null,
    call_back: values.call_back ?? null,
    call_notes: values.call_notes ?? null,
    primary_reason: values.primary_reason ?? null,
    secondary_reason: values.secondary_reason ?? null,
    qa_comments: values.qa_comments ?? null,
    cq1: values.cq1 ?? null,
    cq2: values.cq2 ?? null,
    cq3: values.cq3 ?? null,
    cq4: values.cq4 ?? null,
    cq5: values.cq5 ?? null,
    extra_cq: normalizeExtraCq(values.extra_cq),
    audit_date:
      values.audit_date && typeof (values.audit_date as { format?: (f: string) => string }).format === "function"
        ? (values.audit_date as { format: (f: string) => string }).format("YYYY-MM-DD")
        : null,
    qa_name: undefined, // Auto-set by API when QA user saves
    asset_title: values.asset_title ?? null,
    status: values.status ?? "new",
    lead_disposition: values.lead_disposition ?? null,
    followup_date:
      values.followup_date && typeof (values.followup_date as { format?: (f: string) => string }).format === "function"
        ? (values.followup_date as { format: (f: string) => string }).format("YYYY-MM-DD")
        : null,
    notes: values.notes ?? null,
    qa_status: values.qa_status ?? null,
    disqualification_reasons: Array.isArray(values.disqualification_reasons)
      ? values.disqualification_reasons
          .filter((v) => v != null && String(v).trim())
          .map((v) => String(v).trim())
          .join(", ")
      : null,
    disqualification_reason: values.disqualification_reason ?? null,
    rectified_reason: values.rectified_reason ?? null,
  };
}
