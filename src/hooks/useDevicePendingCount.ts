"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_MS = 60_000;

export function useDevicePendingCount(enabled: boolean) {
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/admin/devices/pending-count", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { pending_count?: number };
      setPendingCount(data.pending_count ?? 0);
    } catch {
      // ignore
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    if (!enabled) return;
    const t = setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("gandiv:device-request", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("gandiv:device-request", onFocus);
    };
  }, [enabled, load]);

  return { pendingCount, refresh: load };
}
