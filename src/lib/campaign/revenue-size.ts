/** Campaign targeting — Revenue Size options (multi-select, same UX as Employee Size). */
export const REVENUE_SIZE_OPTIONS = [
  { value: "Under $1 Million", label: "Under $1 Million" },
  { value: "$1 Million – $5 Million", label: "$1 Million – $5 Million" },
  { value: "$5 Million – $10 Million", label: "$5 Million – $10 Million" },
  { value: "$10 Million – $25 Million", label: "$10 Million – $25 Million" },
  { value: "$25 Million – $50 Million", label: "$25 Million – $50 Million" },
  { value: "$50 Million – $100 Million", label: "$50 Million – $100 Million" },
  { value: "$100 Million – $250 Million", label: "$100 Million – $250 Million" },
  { value: "$250 Million – $500 Million", label: "$250 Million – $500 Million" },
  { value: "$500 Million – $1 Billion", label: "$500 Million – $1 Billion" },
  { value: "Over $1 Billion", label: "Over $1 Billion" },
  { value: "All", label: "All" },
] as const;

export function normalizeRevenueSize(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const cleaned = value
    .filter((v) => v != null && typeof v === "string")
    .map((v) => String(v).trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}
