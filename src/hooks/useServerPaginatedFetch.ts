"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiPaginationMeta } from "@/lib/api-pagination";
import { PAGINATION_SYNC_TOTAL_ONLY } from "@/hooks/useServerTablePagination";

type FetchPageResult<T> = {
  items: T[];
  pagination?: ApiPaginationMeta | null;
};

/**
 * Server-paginated table fetch without overlay blink on page changes.
 * Keeps previous rows visible while the next page loads.
 */
export function useServerPaginatedFetch<T>(options: {
  enabled: boolean;
  resetKey?: string;
  page: number;
  pageSize: number;
  applyPaginationMeta: (
    meta?: ApiPaginationMeta | null,
    opts?: { syncPage?: boolean; syncPageSize?: boolean }
  ) => void;
  fetchPage: (
    page: number,
    pageSize: number,
    signal: AbortSignal
  ) => Promise<FetchPageResult<T>>;
}) {
  const { enabled, resetKey, page, pageSize, applyPaginationMeta, fetchPage } = options;
  const [items, setItems] = useState<T[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const initialDoneRef = useRef(false);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    initialDoneRef.current = false;
    fetchGenRef.current += 1;
    setInitialLoading(true);
  }, [resetKey]);

  const setItemsStable = useCallback((next: T[] | ((prev: T[]) => T[])) => {
    setItems(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const silent = initialDoneRef.current;
    initialDoneRef.current = true;
    const gen = ++fetchGenRef.current;
    const controller = new AbortController();

    void (async () => {
      if (!silent) setInitialLoading(true);
      try {
        const result = await fetchPage(page, pageSize, controller.signal);
        if (gen !== fetchGenRef.current || controller.signal.aborted) return;
        setItems(result.items);
        applyPaginationMeta(result.pagination, PAGINATION_SYNC_TOTAL_ONLY);
      } catch {
        if (gen !== fetchGenRef.current || controller.signal.aborted) return;
      } finally {
        if (gen === fetchGenRef.current && !silent) {
          setInitialLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      fetchGenRef.current += 1;
    };
  }, [enabled, page, pageSize, resetKey, fetchPage, applyPaginationMeta]);

  return {
    items,
    setItems: setItemsStable,
    tableLoading: initialLoading && items.length === 0,
    initialLoading,
  };
}
