"use client";

import { useQuery } from "@tanstack/react-query";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Failed to load");
  }
  return data as T;
}

/**
 * Cached GET request (React Query). Revisiting a tab within ~5 min shows cached data instantly.
 */
export function useCachedApiQuery<T>(
  queryKey: readonly unknown[],
  url: string,
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
    init?: RequestInit;
  }
) {
  return useQuery({
    queryKey,
    queryFn: () => fetchJson<T>(url, options?.init),
    enabled: options?.enabled ?? true,
    placeholderData: (previous) => previous,
    refetchInterval: options?.refetchInterval,
  });
}
