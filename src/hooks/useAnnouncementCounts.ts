"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type PendingAlert = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  sender_name: string | null;
};

export type UnreadAnnouncement = {
  id: string;
  type: string;
  title: string;
  created_at: string;
  sender_name: string | null;
};

export type PendingAnnouncements = {
  alerts: PendingAlert[];
  pending_poll_count: number;
  unread_count: number;
  unread: UnreadAnnouncement[];
};

const QUERY_KEY = ["announcements", "pending"];

/**
 * Pending unacknowledged alerts + open-poll count for the current user.
 * Polls every 60s and refetches instantly when NotificationBell's realtime
 * handler dispatches `gandiv:announcement` (no second Supabase channel).
 */
export function useAnnouncementCounts(enabled: boolean = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<PendingAnnouncements> => {
      const res = await fetch("/api/announcements/pending", { credentials: "include" });
      const data = (await res.json()) as PendingAnnouncements & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load pending announcements");
      return {
        alerts: data.alerts ?? [],
        pending_poll_count: data.pending_poll_count ?? 0,
        unread_count: data.unread_count ?? 0,
        unread: data.unread ?? [],
      };
    },
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    };
    window.addEventListener("gandiv:announcement", handler);
    return () => window.removeEventListener("gandiv:announcement", handler);
  }, [queryClient]);

  return query;
}

/** Invalidate pending announcements after acknowledge/vote actions. */
export function useInvalidateAnnouncementCounts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}
