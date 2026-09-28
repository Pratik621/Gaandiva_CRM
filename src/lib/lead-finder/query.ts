/** Shared query helpers for the lead-finder leads list + CSV export. */

export const LEAD_LIST_COLUMNS =
  "id, run_id, batch_name, first_name, last_name, full_name, email, email_status, phone, mobile_number, job_title, seniority, linkedin_url, company_name, company_website, company_industry, company_size, company_location, contact_city, contact_state, contact_country, created_at";

export const LEAD_SORTABLE_COLUMNS = new Set([
  "created_at",
  "full_name",
  "email",
  "company_name",
  "job_title",
  "contact_state",
]);

type FilterableQuery = {
  or: (filter: string) => FilterableQuery;
  eq: (column: string, value: string) => FilterableQuery;
  ilike: (column: string, pattern: string) => FilterableQuery;
};

/** Apply q/batch/run_id/industry/title/state filters from the query string. */
export function applyLeadFilters<T extends FilterableQuery>(query: T, sp: URLSearchParams): T {
  let q = query as FilterableQuery;

  const search = sp.get("q")?.trim();
  if (search) {
    const safe = search.replace(/([%_,()])/g, "\\$1");
    q = q.or(
      `full_name.ilike.%${safe}%,email.ilike.%${safe}%,company_name.ilike.%${safe}%,job_title.ilike.%${safe}%`
    );
  }
  const batch = sp.get("batch")?.trim();
  if (batch) q = q.eq("batch_name", batch);
  const runId = sp.get("run_id")?.trim();
  if (runId) q = q.eq("run_id", runId);
  const industry = sp.get("industry")?.trim();
  if (industry) q = q.ilike("company_industry", `%${industry}%`);
  const title = sp.get("title")?.trim();
  if (title) q = q.ilike("job_title", `%${title}%`);
  const state = sp.get("state")?.trim();
  if (state) q = q.ilike("contact_state", `%${state}%`);

  return q as T;
}
