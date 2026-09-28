"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";

type UseCampaignFeedUnreadOptions = {
  campaignId: string;
  enabled?: boolean;
  /** Pause realtime refresh while feed is open. */
  paused?: boolean;
};

export function useCampaignFeedUnread({
  campaignId,
  enabled = true,
  paused = false,
}: UseCampaignFeedUnreadOptions) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const fetchUnread = useCallback(async () => {
    if (!enabled || !campaignId) return;
    try {
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/unread`
      );
      const data = (await res.json()) as { count?: number };
      if (res.ok && !pausedRef.current) {
        setUnreadCount(data.count ?? 0);
      }
    } catch {
      /* non-blocking */
    }
  }, [campaignId, enabled]);

  const markRead = useCallback(async () => {
    setUnreadCount(0);
    if (!campaignId) return;
    try {
      await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/unread`,
        { method: "POST" }
      );
    } catch {
      /* non-blocking */
    }
  }, [campaignId]);

  useEffect(() => {
    if (!enabled) return;
    void fetchUnread();
  }, [enabled, fetchUnread]);

  useEffect(() => {
    if (!paused && enabled) void fetchUnread();
  }, [paused, enabled, fetchUnread]);

  useEffect(() => {
    if (!enabled || !user?.id || !campaignId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`campaign-feed-unread:${campaignId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "campaign_feed_activity_log",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          if (!pausedRef.current) void fetchUnread();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, campaignId, enabled, fetchUnread]);

  return { unreadCount, markRead, refreshUnread: fetchUnread };
}
