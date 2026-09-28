"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { buildLoginRedirectPath } from "@/lib/auth/config";
import { authDebug } from "@/lib/auth/debug";

type GuardStatus = "loading" | "authorized" | "redirecting";

interface GuardResult {
  status: GuardStatus;
  isAuthorized: boolean;
}

const LOADING_RESULT: GuardResult = { status: "loading", isAuthorized: false };

export function useRoleGuard(allowedRoles: string[]) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, session, isLoading, isInitialized, hasRole, getDefaultRedirect } = useAuth();

  const isAuthorized = useMemo(
    () => allowedRoles.some((role) => hasRole(role)),
    [allowedRoles, hasRole]
  );

  // ─── Last-known-stable-state cache ───────────────────────────────────────────
  // Once the user is fully authenticated and the guard has resolved to a definitive
  // state (authorized or redirecting), cache it. If a background isLoading=true
  // fires (e.g. a lingering SIGNED_IN / USER_UPDATED event), we return the cached
  // state instead of flashing a loading spinner — matching HubSpot/Zoho UX.
  const lastStableRef = useRef<GuardResult | null>(null);

  // Compute the current stable result only when auth is not in-flight.
  // null means "no stable result yet" (initial load, or actively loading).
  const stableResult = useMemo<GuardResult | null>(() => {
    if (!isInitialized || isLoading) return null;
    if ((!user && !session) || !isAuthorized) {
      return { status: "redirecting", isAuthorized: false };
    }
    return { status: "authorized", isAuthorized: true };
  }, [isInitialized, isLoading, user, session, isAuthorized]);

  // Persist the stable result in a ref (safe to mutate during render).
  if (stableResult !== null) {
    lastStableRef.current = stableResult;
  }

  // ─── Redirect side-effect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized || isLoading) {
      return;
    }

    if (!user && !session) {
      const currentSearch =
        typeof window !== "undefined" ? window.location.search : "";
      const loginPath = buildLoginRedirectPath(pathname, currentSearch);
      authDebug("guard", "redirect anonymous user to login", {
        pathname,
        loginPath,
      });
      router.replace(loginPath);
      return;
    }

    if (!isAuthorized) {
      const fallbackPath = getDefaultRedirect();
      authDebug("guard", "redirect authenticated user to default dashboard", {
        pathname,
        fallbackPath,
        allowedRoles,
      });
      router.replace(fallbackPath);
    }
  }, [
    allowedRoles,
    getDefaultRedirect,
    isAuthorized,
    isInitialized,
    isLoading,
    pathname,
    router,
    session,
    user,
  ]);

  // ─── Status resolution ───────────────────────────────────────────────────────

  // Phase 1 — not yet initialized: always show loading (first page load only).
  if (!isInitialized) {
    return LOADING_RESULT;
  }

  // Phase 2 — background loading (token refresh, online recovery, etc.).
  // Return the last known stable state so the dashboard stays visible.
  // If we have no stable state yet (isLoading on very first frame), show loading.
  if (isLoading) {
    authDebug("guard", "background isLoading - using last stable state", {
      pathname,
      lastStable: lastStableRef.current?.status ?? "none",
    });
    return lastStableRef.current ?? LOADING_RESULT;
  }

  // Phase 3 — stable: return the freshly computed result.
  return stableResult ?? LOADING_RESULT;
}
