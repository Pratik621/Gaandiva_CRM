/**
 * Sanitize user text for PostgREST `ilike` filters.
 * Commas and parentheses break `.or()` comma-separated filter strings.
 */
export function sanitizePostgrestIlike(raw: string): string {
  const q = raw.trim().replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
  return q.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/** `%term%` for `.ilike(column, pattern)` — empty string if nothing searchable remains. */
export function postgrestIlikePattern(raw: string): string {
  const safe = sanitizePostgrestIlike(raw);
  return safe ? `%${safe}%` : "";
}

/** Double-quoted operand for `.or(col.ilike."%term%")` — safe for commas, apostrophes, etc. */
function postgrestOrIlikeOperand(safeTerm: string): string {
  const pattern = `%${safeTerm.replace(/"/g, '""')}%`;
  return `"${pattern}"`;
}

/** `col.ilike."%term%",col2.ilike."%term%"` for `.or()` — null if term is empty. */
export function postgrestOrIlikeFilters(columns: string[], raw: string): string | null {
  const safe = sanitizePostgrestIlike(raw);
  if (!safe) return null;
  const operand = postgrestOrIlikeOperand(safe);
  return columns.map((col) => `${col}.ilike.${operand}`).join(",");
}

/**
 * Split an array into fixed-size batches. A PostgREST `.in(column, ids)` filter is sent as
 * a GET query string, so a few hundred UUIDs (org-wide campaign scans, etc.) can exceed the
 * ~16KB request-header limit and throw `UND_ERR_HEADERS_OVERFLOW`. Batch large id lists with
 * this and merge the results instead of passing the whole array to a single `.in()` call.
 */
export function chunkArray<T>(items: T[], size = 150): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
