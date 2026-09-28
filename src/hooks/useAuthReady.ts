"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * True once auth is initialized, a user exists, and profile/roles have loaded.
 *
 * Safety valve: if isLoading never clears (slow profile sync, network stall),
 * unblock after AUTH_READY_STUCK_LOADING_MS so pages can attempt fetches.
 * fetchWithAuthRetry handles transient 401s gracefully.
 *
 * We do NOT gate on session.access_token — after a fresh tab open, getUser()
 * resolves before the in-memory session is hydrated from storage. Server API
 * routes authenticate via cookies, so user alone is the correct signal.
 */
const AUTH_READY_STUCK_LOADING_MS = 1_500;

export function useAuthReady() {
  const { isInitialized, isLoading, user } = useAuth();
  const [unblockStuckLoading, setUnblockStuckLoading] = useState(false);

  useEffect(() => {
    // Only arm the stuck-loading timer when we have a user but isLoading is
    // still true (profile/roles sync is slow). Reset when conditions change.
    if (!isInitialized || !user || !isLoading) {
      setUnblockStuckLoading(false);
      return;
    }
    const t = window.setTimeout(() => setUnblockStuckLoading(true), AUTH_READY_STUCK_LOADING_MS);
    return () => window.clearTimeout(t);
  }, [isInitialized, user, isLoading]);

  return Boolean(isInitialized && user) && (!isLoading || unblockStuckLoading);
}
