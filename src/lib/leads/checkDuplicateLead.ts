import type { SupabaseClient } from "@supabase/supabase-js";

type DuplicateLeadInput = {
  first_name?: unknown;
  last_name?: unknown;
  company_name?: unknown;
  domain?: unknown;
  contact_linkedin_url?: unknown;
  job_title_link?: unknown;
  email?: unknown;
};

export type DuplicateLeadMatch = {
  leadId: string;
  reason:
    | "Email ID"
    | "Prospect LinkedIn URL"
    | "Job Title Link"
    | "First Name + Last Name + Company Name"
    | "First Name + Last Name + Company Domain";
};

export type DuplicateLeadRecord = DuplicateLeadInput & {
  id?: unknown;
  lead_id?: unknown;
};  

type DuplicateCheckOptions = {
  includeProspectLinkedIn?: boolean;
  includeJobTitleLink?: boolean;
};

export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeDomain(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw) return "";
  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").split("/")[0];
  }
}

/**
 * Produces a comparable company key from either a company name or domain.
 * For example: "ABC Pvt Ltd", "abc.com", and "www.abc.co.in" become "abc".
 */
export function normalizeCompanyBase(value: unknown, isDomain = false): string {
  let raw = normalizeText(value);
  if (!raw) return "";

  if (isDomain) {
    raw = normalizeDomain(raw).split(".")[0] ?? "";
  } else {
    raw = raw
      .replace(/\b(private|pvt|limited|ltd|incorporated|inc|corporation|corp|llc|l\.l\.c|lcc|llp|plc|gmbh)\b\.?/g, " ")
      .trim();
  }

  return raw.replace(/[^a-z0-9]/g, "");
}

export function normalizeLinkedInUrl(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw) return "";
  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname}`
      .replace(/\/+$/, "")
      .toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[?#]/)[0]
      .replace(/\/+$/, "");
  }
}

/** Applies the shared duplicate rules to a candidate and supplied lead records. */
export function findDuplicateLeadMatch(
  lead: DuplicateLeadInput,
  existingLeads: DuplicateLeadRecord[],
  {
    includeProspectLinkedIn = true,
    includeJobTitleLink = true,
  }: DuplicateCheckOptions = {}
): DuplicateLeadMatch | null {
  const candidate = {
    firstName: normalizeText(lead.first_name),
    lastName: normalizeText(lead.last_name),
    companyBase: normalizeCompanyBase(lead.company_name),
    domainBase: normalizeCompanyBase(lead.domain, true),
    linkedInUrl: normalizeLinkedInUrl(lead.contact_linkedin_url),
    jobTitleLink: normalizeLinkedInUrl(lead.job_title_link),
    email: normalizeText(lead.email),
  };

  for (const row of existingLeads) {
    const existingFirstName = normalizeText(row.first_name);
    const existingLastName = normalizeText(row.last_name);
    const sameName =
      Boolean(candidate.firstName && candidate.lastName) &&
      candidate.firstName === existingFirstName &&
      candidate.lastName === existingLastName;
    const leadId = String(row.lead_id ?? row.id ?? "existing lead");
    const existingCompanyBase = normalizeCompanyBase(row.company_name);
    const existingDomainBase = normalizeCompanyBase(row.domain, true);

    if (candidate.email && candidate.email === normalizeText(row.email)) {
      return { leadId, reason: "Email ID" };
    }
    if (
      includeProspectLinkedIn &&
      candidate.linkedInUrl &&
      candidate.linkedInUrl === normalizeLinkedInUrl(row.contact_linkedin_url)
    ) {
      return { leadId, reason: "Prospect LinkedIn URL" };
    }
    if (
      includeJobTitleLink &&
      candidate.jobTitleLink &&
      candidate.jobTitleLink === normalizeLinkedInUrl(row.job_title_link)
    ) {
      return { leadId, reason: "Job Title Link" };
    }
    if (
      sameName &&
      candidate.companyBase &&
      candidate.companyBase === existingCompanyBase
    ) {
      return { leadId, reason: "First Name + Last Name + Company Name" };
    }
    if (
      sameName &&
      ((candidate.domainBase && candidate.domainBase === existingDomainBase) ||
        (candidate.companyBase && candidate.companyBase === existingDomainBase) ||
        (candidate.domainBase && candidate.domainBase === existingCompanyBase))
    ) {
      return { leadId, reason: "First Name + Last Name + Company Domain" };
    }
  }

  return null;
}

/** Finds a manually-created lead's duplicate within the same campaign only. */
export async function checkDuplicateLead(
  supabase: SupabaseClient,
  {
    campaignId,
    organizationId,
    lead,
  }: {
    campaignId: string;
    organizationId: string;
    lead: DuplicateLeadInput;
  }
): Promise<DuplicateLeadMatch | null> {
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, lead_id, first_name, last_name, company_name, domain, contact_linkedin_url, job_title_link, email")
      .eq("campaign_id", campaignId)
      .eq("organization_id", organizationId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as DuplicateLeadRecord[];
    const match = findDuplicateLeadMatch(lead, rows);
    if (match) return match;

    if (rows.length < pageSize) return null;
  }
}
