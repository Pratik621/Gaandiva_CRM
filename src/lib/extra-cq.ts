/** CQ6+ stored in leads.extra_cq as { cq6: "...", cq7: "..." }. */

export type ExtraCqMap = Record<string, string>;

export function parseExtraCqIndexes(extra_cq: unknown): number[] {
  if (!extra_cq || typeof extra_cq !== "object" || Array.isArray(extra_cq)) return [];
  return Object.keys(extra_cq as Record<string, unknown>)
    .map((key) => /^cq(\d+)$/i.exec(key)?.[1])
    .filter((n): n is string => Boolean(n))
    .map((n) => Number(n))
    .filter((n) => n >= 6 && Number.isFinite(n))
    .sort((a, b) => a - b);
}

export function normalizeExtraCq(raw: unknown): ExtraCqMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: ExtraCqMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const match = /^cq(\d+)$/i.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    if (index < 6 || !Number.isFinite(index)) continue;
    const text = value != null ? String(value).trim() : "";
    if (text) out[`cq${index}`] = text;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function extraCqToFormValues(extra_cq: unknown): ExtraCqMap | undefined {
  const normalized = normalizeExtraCq(extra_cq);
  return normalized ?? undefined;
}

export function nextExtraCqIndex(existing: number[]): number {
  if (existing.length === 0) return 6;
  return Math.max(...existing) + 1;
}
