/**
 * Lead-engine dataset item → lead_finder_leads row mapping.
 *
 * Field names vary between export styles, so every mapped field checks several
 * candidate keys (top-level and nested `organization`/`company` objects). The
 * COMPLETE original item is always stored in raw_data so nothing is lost.
 */

type Raw = Record<string, unknown>;

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number") return String(value);
  return null;
}

function nested(item: Raw, key: string): Raw {
  const value = item[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

/** First non-empty string among candidate keys, checking org/company too. */
function pick(item: Raw, keys: string[]): string | null {
  const org = nested(item, "organization");
  const company = nested(item, "company");
  for (const key of keys) {
    const direct = str(item[key]);
    if (direct) return direct;
    const fromOrg = str(org[key]);
    if (fromOrg) return fromOrg;
    const fromCompany = str(company[key]);
    if (fromCompany) return fromCompany;
  }
  return null;
}

export type MappedLead = {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  email_status: string | null;
  phone: string | null;
  mobile_number: string | null;
  job_title: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  company_name: string | null;
  company_website: string | null;
  company_linkedin: string | null;
  company_industry: string | null;
  company_size: string | null;
  company_location: string | null;
  contact_city: string | null;
  contact_state: string | null;
  contact_country: string | null;
  raw_data: Raw;
};

/**
 * Some actors push error/notice items into the dataset instead of failing the
 * run (e.g. "free plan can only run via UI"). Detect them so they never get
 * imported as leads.
 */
export function extractActorError(item: Raw): string | null {
  const error = str(item.error) ?? str(item.message);
  if (!error) return null;
  // A real lead row would carry at least one identity field.
  const hasLeadData = Boolean(
    pick(item, ["email", "first_name", "last_name", "name", "organization_name", "company_name"])
  );
  if (hasLeadData) return null;
  // Never surface vendor billing URLs from dataset notice rows.
  return (
    error
      .replace(/https?:\/\/[^\s)]+/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim() || "Lead engine returned an error item"
  );
}

export function mapEngineItem(item: Raw): MappedLead {
  const firstName = pick(item, ["first_name", "firstName"]);
  const lastName = pick(item, ["last_name", "lastName"]);
  const fullName =
    pick(item, ["full_name", "name", "fullName"]) ??
    ([firstName, lastName].filter(Boolean).join(" ").trim() || null);

  // Dedupe key — always lowercased before storage.
  const email = pick(item, ["email", "work_email", "business_email"])?.toLowerCase() ?? null;

  const companyCity = pick(item, ["organization_city", "company_city"]);
  const companyState = pick(item, ["organization_state", "company_state"]);
  const companyCountry = pick(item, ["organization_country", "company_country"]);
  const companyLocation =
    pick(item, ["company_location", "organization_location"]) ??
    ([companyCity, companyState, companyCountry].filter(Boolean).join(", ") || null);

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email,
    email_status: pick(item, ["email_status", "emailStatus", "email_confidence"]),
    phone: pick(item, ["phone", "phone_number", "sanitized_phone", "work_direct_phone"]),
    mobile_number: pick(item, ["mobile_number", "mobile", "personal_phone"]),
    job_title: pick(item, ["title", "job_title", "headline", "position"]),
    seniority: pick(item, ["seniority", "seniority_level"]),
    linkedin_url: pick(item, ["linkedin_url", "linkedin", "person_linkedin_url"]),
    photo_url: pick(item, ["photo_url", "avatar", "picture_url"]),
    company_name: pick(item, ["organization_name", "company_name", "company"]),
    company_website: pick(item, [
      "organization_website_url",
      "company_website",
      "website_url",
      "website",
      "domain",
    ]),
    company_linkedin: pick(item, [
      "organization_linkedin_url",
      "company_linkedin",
      "company_linkedin_url",
    ]),
    company_industry: pick(item, ["industry", "company_industry", "organization_industry"]),
    company_size: pick(item, [
      "company_size",
      "organization_num_employees",
      "estimated_num_employees",
      "size",
    ]),
    company_location: companyLocation,
    contact_city: pick(item, ["city", "contact_city", "person_city"]),
    contact_state: pick(item, ["state", "contact_state", "person_state"]),
    contact_country: pick(item, ["country", "contact_country", "person_country"]),
    raw_data: item,
  };
}
