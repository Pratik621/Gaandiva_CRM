/**
 * Reads the optional `from` / `to` query params (ISO timestamps the browser
 * computes from the picked days in the user's own timezone) used to filter
 * leads by when they were received (simplified_leads.created_at — Meta's
 * lead time for Meta leads). Invalid values are ignored.
 */
export function parseLeadDateRange(searchParams: URLSearchParams): { from: string | null; to: string | null } {
  const read = (key: string) => {
    const value = searchParams.get(key);
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
  };
  return { from: read("from"), to: read("to") };
}
