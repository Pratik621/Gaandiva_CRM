"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TablePaginationConfig } from "antd/es/table";
import {
  LIST_PAGE_SIZE_DEFAULT,
  LIST_PAGE_SIZE_OPTIONS,
  type ApiPaginationMeta,
} from "@/lib/api-pagination";

/** Keep client-owned page/pageSize; only sync total from API (prevents pagination blink). */
export const PAGINATION_SYNC_TOTAL_ONLY = {
  syncPage: false,
  syncPageSize: false,
} as const;

/** Table overlay only on first load when there is no cached row data yet. */
export function serverTableInitialLoading(isLoading: boolean, itemCount: number): boolean {
  return isLoading && itemCount === 0;
}

export function useSyncListPaginationTotal(
  pagination: ApiPaginationMeta | undefined | null,
  applyPaginationMeta: (
    meta?: ApiPaginationMeta | null,
    options?: { syncPage?: boolean; syncPageSize?: boolean }
  ) => void
) {
  useEffect(() => {
    if (pagination) {
      applyPaginationMeta(pagination, PAGINATION_SYNC_TOTAL_ONLY);
    }
  }, [pagination, applyPaginationMeta]);
}

export function useServerTablePagination(initialPageSize = LIST_PAGE_SIZE_DEFAULT) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);

  const applyPaginationMeta = useCallback(
    (
      meta?: ApiPaginationMeta | null,
      options?: { syncPage?: boolean; syncPageSize?: boolean }
    ) => {
      if (!meta) return;
      setTotal((prev) => (prev === meta.total ? prev : meta.total));
      const syncPage = options?.syncPage !== false;
      const syncPageSize = options?.syncPageSize !== false;
      if (syncPage && meta.page > 0) {
        setPage((prev) => (prev === meta.page ? prev : meta.page));
      }
      if (syncPageSize && meta.limit > 0) {
        setPageSize((prev) => (prev === meta.limit ? prev : meta.limit));
      }
    },
    []
  );

  const resetPage = useCallback(() => setPage(1), []);

  const onTableChange = useCallback((nextPage: number, nextPageSize: number) => {
    setPage((prev) => (prev === nextPage ? prev : nextPage));
    setPageSize((prev) => (prev === nextPageSize ? prev : nextPageSize));
  }, []);

  const tablePagination: TablePaginationConfig = useMemo(
    () => ({
      current: page,
      pageSize,
      total,
      showSizeChanger: true,
      pageSizeOptions: [...LIST_PAGE_SIZE_OPTIONS],
      showTotal: (t: number) => `Total ${t}`,
      responsive: true,
      onChange: onTableChange,
    }),
    [page, pageSize, total, onTableChange]
  );

  return {
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    setTotal,
    resetPage,
    applyPaginationMeta,
    tablePagination,
  };
}
