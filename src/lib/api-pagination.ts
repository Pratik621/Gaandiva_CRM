/** Shared server-side list pagination (campaigns, leads, etc.). */
export const LIST_PAGE_SIZE_DEFAULT = 10;
export const LIST_PAGE_SIZE_MAX = 100;

export const LIST_PAGE_SIZE_OPTIONS = ["10", "25", "50", "100"] as const;

export type ApiPaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function clampPage(raw: unknown): number {
  const n = parseInt(String(raw ?? "1"), 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

export function clampListLimit(
  raw: unknown,
  defaultLimit: number = LIST_PAGE_SIZE_DEFAULT
): number {
  const n = parseInt(String(raw ?? defaultLimit), 10);
  if (Number.isNaN(n)) return defaultLimit;
  return Math.max(1, Math.min(LIST_PAGE_SIZE_MAX, n));
}

export function parseListPagination(
  searchParams: URLSearchParams,
  defaultLimit: number = LIST_PAGE_SIZE_DEFAULT
): { page: number; limit: number; offset: number } {
  const page = clampPage(searchParams.get("page"));
  const limit = clampListLimit(searchParams.get("limit"), defaultLimit);
  return { page, limit, offset: (page - 1) * limit };
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number
): ApiPaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
}

export function appendListPagination(
  params: URLSearchParams,
  page: number,
  limit: number
): URLSearchParams {
  params.set("page", String(page));
  params.set("limit", String(limit));
  return params;
}
