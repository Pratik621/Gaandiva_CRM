"use client";

import { useQuery } from "@tanstack/react-query";
import { buildListApiUrl } from "@/lib/build-list-api-url";
import type { ApiPaginationMeta } from "@/lib/api-pagination";

type ListResponse = {
  pagination?: ApiPaginationMeta;
  error?: string;
  [key: string]: unknown;
};

/**
 * Cached paginated list fetch (React Query).
 * Revisiting a menu tab within ~5 min shows cached data instantly instead of reloading.
 */
export function usePaginatedListQuery<TItem>(options: {
  queryKeyPrefix: readonly unknown[];
  url: string;
  params: Record<string, string | number | boolean | null | undefined>;
  listField: string;
  enabled?: boolean;
  /** Custom fetch (e.g. fetchWithAuthRetry for command APIs). */
  fetcher?: (url: string) => Promise<Response>;
}) {
  const listUrl = buildListApiUrl(options.url, options.params);

  const query = useQuery({
    queryKey: [...options.queryKeyPrefix, listUrl],
    queryFn: async () => {
      const res = options.fetcher
        ? await options.fetcher(listUrl)
        : await fetch(listUrl, { credentials: "include" });
      const data = (await res.json()) as ListResponse;
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      return data;
    },
    enabled: options.enabled ?? true,
    placeholderData: (previous) => previous,
  });

  const items = (query.data?.[options.listField] as TItem[] | undefined) ?? [];

  return {
    ...query,
    items,
    pagination: query.data?.pagination as ApiPaginationMeta | undefined,
    response: query.data,
  };
}
