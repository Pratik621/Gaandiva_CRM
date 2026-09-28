// PostgREST caps every response at 1000 rows by default, so a plain
// `.select()` silently drops everything past that. Meta imports push
// simplified_leads past 1000 quickly — list/count queries page through here.

const PAGE_SIZE = 1000;

type RangeQuery<T> = (
  from: number,
  to: number
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Runs `query(from, to)` page by page until a short page comes back. The
 * query must have a stable order (add `.order("id")` as a tiebreaker) so rows
 * don't shift between pages.
 */
export async function fetchAllRows<T>(query: RangeQuery<T>): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
