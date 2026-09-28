/**
 * PostgREST puts `.in(...)` values in the request URL. Undici / many proxies
 * reject requests once headers exceed ~16KB (UND_ERR_HEADERS_OVERFLOW).
 * ~100 UUIDs ≈ 3.7KB of filter text — safe headroom with other query params.
 */
export const POSTGREST_IN_CHUNK_SIZE = 100;
export const POSTGREST_PAGE_SIZE = 1000;

export function chunkIds<T>(ids: readonly T[], size = POSTGREST_IN_CHUNK_SIZE): T[][] {
  if (ids.length === 0) return [];
  if (ids.length <= size) return [Array.from(ids)];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(Array.from(ids.slice(i, i + size)));
  }
  return out;
}

type ChunkPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Run a PostgREST query that filters with `.in(column, ids)`, chunking IDs and
 * paginating each chunk so large orgs never blow the URL/header limit or the
 * 1000-row response cap.
 */
export async function fetchAllByIdChunks<T>(
  ids: readonly string[],
  fetchPage: (
    idChunk: string[],
    from: number,
    to: number
  ) => Promise<ChunkPageResult<T>>,
  pageSize = POSTGREST_PAGE_SIZE
): Promise<T[]> {
  if (ids.length === 0) return [];

  const all: T[] = [];
  for (const idChunk of chunkIds(ids)) {
    let offset = 0;
    for (;;) {
      const { data, error } = await fetchPage(idChunk, offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = data ?? [];
      all.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
  }
  return all;
}
