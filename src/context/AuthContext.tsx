"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { createClient, resetClient } from "@/lib/supabase/client";
import { purgeSupabaseAuthCookiesFromDocument } from "@/lib/supabase/browser-auth-cleanup";
import type { Session, User } from "@supabase/supabase-js";
import type { Tables } from "@/types/database.types";
import {
  AUTH_STORAGE_KEYS,
  getDefaultRedirectPath,
  normalizeRoleName,
  resolvePostLoginRedirect,
} from "@/lib/auth/config";
import { getTLGuardRoles } from "@/lib/auth/tl-access";
import { getSTLGuardRoles } from "@/lib/auth/stl-access";
import { authDebug } from "@/lib/auth/debug";
import { fetchMfaStatus, ensureDeviceRegistered, resolvePostAuthPath } from "@/lib/mfa/resolve-post-auth";

/** Cross-tab: any tab that signs out tells others to drop stale JS + cookies. */
const AUTH_SIGNOUT_BROADCAST_CHANNEL = "gandiv:auth-signout";

export type UserRole = {
  id: string;
  name: string;
  role_name: string;
  description?: string | null;
  // Optional because some deployments may not allow selecting organization_id
  // on the joined `roles` relation (RLS/column permissions).
  organization_id?: string | null;
};
export type UserProfile = Tables<"users">;

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  roles: UserRole[];
  isLoading: boolean;
  isInitialized: boolean;
  /**
   * Monotonically increasing counter bumped on every successful auth sync.
   * Consumers can include this in `useEffect` deps to re-run data fetches when
   * the auth state is refreshed (cross-tab token rotation, tab visibility return,
   * manual `refreshProfile()`, sign-in for a new user, etc.).
   */
  authVersion: number;
}

interface AuthContextValue extends AuthState {
  signIn: (
    email: string,
    password: string,
    requestedRedirectPath?: string
  ) => Promise<{ error: Error | null; redirectPath?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (roleName: string) => boolean;
  getDefaultRedirect: () => string;
  hasTLAccess: () => boolean;
  hasSTLAccess: () => boolean;
}

/** If full `syncAuthState("init")` is slow, unblock UI so layouts/pages don't spin forever (cold tab / cookie hydration race). */
const INIT_FALLBACK_TIMEOUT_MS = 5_000;
const VISIBILITY_MIN_HIDDEN_MS = 30_000;
/** Same-origin profile fetch — never let it hang without an upper bound. */
const PROFILE_API_TIMEOUT_MS = 12_000;
/**
 * If a single `supabase.auth.getUser()` wedges (network, GoTrue lock, browser quirks),
 * every caller used to await the same promise for minutes. Abandon and start fresh.
 */
const GET_USER_IN_FLIGHT_STALE_MS = 10_000;
/** If `getUser()` does not resolve in time, trust same-origin `/api/profile` (cookie session). */
const GET_USER_PRIMARY_DEADLINE_MS = 10_000;

const AuthContext = createContext<AuthContextValue | null>(null);

function toUserRoles(roleRows: { role_id: string; roles: { name: string } | null }[]): UserRole[] {
  return roleRows
    .filter((r) => r.roles?.name)
    .map((r) => ({
      id: r.role_id,
      name: r.roles!.name,
      role_name: r.roles!.name,
      description: null,
    }));
}

function getRoleNames(roles: UserRole[]) {
  return roles.map((role) => role.role_name);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStoredRedirectPath() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEYS.lastRedirectPath);
  } catch {
    return null;
  }
}

function persistRedirectPath(path: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(AUTH_STORAGE_KEYS.lastRedirectPath, path);
  } catch {
    // Ignore storage failures.
  }
}

function purgeSupabaseKeysFromStore(store: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key) continue;
    if (key.startsWith("sb-") || key.toLowerCase().includes("supabase")) {
      keys.push(key);
    }
  }
  keys.forEach((k) => store.removeItem(k));
}

import { cache, GANDIV_CACHE_PREFIX } from "@/lib/cache";

function clearClientStorage() {
  if (typeof window === "undefined") return;
  try {
    // Clear all localStorage keys — Supabase sb-* tokens, app cache, redirect path
    purgeSupabaseKeysFromStore(window.localStorage);
    purgeSupabaseKeysFromStore(window.sessionStorage);
    window.localStorage.removeItem(AUTH_STORAGE_KEYS.lastRedirectPath);
    cache.clearByPrefix(GANDIV_CACHE_PREFIX);
    // Expire all readable Supabase cookies from document
    purgeSupabaseAuthCookiesFromDocument();
    // Reset the module-level Supabase client singleton so the next
    // createClient() call returns a fresh instance with zero in-memory
    // session state. Without this, getSession() on the login page returns
    // the old session from the stale in-memory cache even after cookies
    // are cleared, causing slow/failed re-auth on the next sign-in.
    resetClient();
  } catch (err) {
    console.warn("Failed to clear auth browser storage", err);
  }
}

function broadcastAuthSignedOut() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return;
  }
  try {
    const bc = new BroadcastChannel(AUTH_SIGNOUT_BROADCAST_CHANNEL);
    bc.postMessage("signed-out");
    bc.close();
  } catch {
    // Ignore — e.g. private mode restrictions.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    roles: [],
    isLoading: true,
    isInitialized: false,
    authVersion: 0,
  });

  // Stable singleton — createClient() returns a module-level cached instance,
  // but calling it on every render is unnecessary. useRef ensures one call.
  const supabase = useRef(createClient()).current;
  const syncRequestRef = useRef(0);

  // Tracks the currently authenticated user's ID so event handlers can detect
  // whether an incoming auth event is for the same user (background token refresh /
  // cross-tab session sync) vs. a genuine new sign-in that requires a full re-sync.
  const currentUserIdRef = useRef<string | null>(null);

  // In-flight deduplication for getUser(): if init() and a SIGNED_IN event handler
  // both call resolveSessionUser() at the same moment, they share a single server
  // round-trip instead of making N parallel requests (rate-limit & perf guard).
  type GetUserPromise = ReturnType<typeof supabase.auth.getUser>;
  const getUserInFlightRef = useRef<{ promise: GetUserPromise; started: number } | null>(null);

  const getValidatedUser = useCallback(() => {
    const now = Date.now();
    if (
      getUserInFlightRef.current &&
      now - getUserInFlightRef.current.started > GET_USER_IN_FLIGHT_STALE_MS
    ) {
      getUserInFlightRef.current = null;
    }
    if (!getUserInFlightRef.current) {
      const started = Date.now();
      const promise = supabase.auth.getUser().finally(() => {
        if (getUserInFlightRef.current?.promise === promise) {
          getUserInFlightRef.current = null;
        }
      });
      getUserInFlightRef.current = { promise, started };
    }
    return getUserInFlightRef.current.promise;
  }, [supabase]);

  const fetchProfileAndRolesFromApi = useCallback(async () => {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), PROFILE_API_TIMEOUT_MS);
    try {
      const response = await fetch("/api/profile", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: ac.signal,
      });

      if (!response.ok) {
        throw new Error(`Profile API returned ${response.status}`);
      }

      const data = (await response.json()) as {
        profile?: (UserProfile & { roles?: string[] }) | null;
      };

      const profile = (data.profile ?? null) as UserProfile | null;
      const roles = (data.profile?.roles ?? [])
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
        .map((name) => ({
          id: name,
          name,
          role_name: name,
          description: null,
        }));

      return { profile, roles };
    } finally {
      clearTimeout(tid);
    }
  }, []);

  const resolveSessionUser = useCallback(async () => {
    const sessionFromStorage = async (): Promise<Session | null> => {
      let session = (await supabase.auth.getSession()).data.session ?? null;
      if (!session) {
        for (let i = 0; i < 3 && !session; i++) {
          await wait(50);
          session = (await supabase.auth.getSession()).data.session ?? null;
        }
      }
      return session;
    };

    /** Server reads HttpOnly/session cookies — often valid when `getUser()` is still null (refresh race). */
    const bootstrapFromProfileApi = async (): Promise<{ session: Session | null; user: User | null }> => {
      authDebug("provider", "resolveSessionUser: bootstrapping via /api/profile");
      try {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), PROFILE_API_TIMEOUT_MS);
        const res = await fetch("/api/profile", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });
        clearTimeout(tid);
        if (!res.ok) {
          return { session: null, user: null };
        }
        const data = (await res.json()) as {
          profile?: { id: string; email?: string | null } | null;
        };
        const pid = data.profile?.id;
        if (!pid) {
          return { session: null, user: null };
        }
        const syntheticUser = {
          id: pid,
          aud: "authenticated",
          role: "authenticated",
          email: data.profile?.email ?? undefined,
          app_metadata: {},
          user_metadata: {},
          created_at: "",
        } as User;
        const session = await sessionFromStorage();
        return { session, user: syntheticUser };
      } catch {
        return { session: null, user: null };
      }
    };

    const race = await Promise.race([
      getValidatedUser().then((r) => ({ kind: "getUser" as const, r })),
      wait(GET_USER_PRIMARY_DEADLINE_MS).then(() => ({ kind: "deadline" as const })),
    ]);

    if (race.kind === "getUser") {
      const {
        data: { user },
        error,
      } = race.r;
      if (!error && user) {
        const session = await sessionFromStorage();
        return { session, user };
      }
      // `getUser()` often returns no user immediately after hard refresh even though
      // `/api/profile` succeeds — same-origin cookies are already valid. Do not bail
      // before trying the profile API.
      return bootstrapFromProfileApi();
    }

    authDebug("provider", "resolveSessionUser: getUser slow — bootstrapping via /api/profile");
    return bootstrapFromProfileApi();
  }, [getValidatedUser, supabase]);

  const fetchProfileAndRoles = useCallback(
    async (userId: string) => {
      // Prefer same-origin `/api/profile` first: one round-trip, server-side Supabase
      // with the session cookie, avoids production-only slowness/hangs from browser
      // PostgREST (`users` / `user_roles`) under RLS or cross-region latency.
      try {
        const apiData = await fetchProfileAndRolesFromApi();
        const idOk = !apiData.profile?.id || apiData.profile.id === userId;
        if (idOk && (apiData.roles.length > 0 || apiData.profile)) {
          return apiData;
        }
        if (!idOk) {
          console.warn("[auth] Profile API user id mismatch; trying direct Supabase queries");
        }
      } catch (e) {
        console.warn("Profile API (primary) failed, trying direct Supabase queries:", e);
      }

      const DIRECT_QUERY_MS = 14_000;
      const directQueries = Promise.all([
        supabase.from("users").select("*").eq("id", userId).single(),
        supabase
          .from("user_roles")
          // Keep this selection minimal and aligned with `middleware.ts`:
          // only fetch the role name to avoid RLS/column-permission issues
          // in production that can lead to an empty `roles` array.
          .select("role_id, roles(name)")
          .eq("user_id", userId),
      ]);

      let profileRes: Awaited<typeof directQueries>[0];
      let rolesRes: Awaited<typeof directQueries>[1];
      try {
        const pair = await Promise.race([
          directQueries,
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("profile-direct-timeout")), DIRECT_QUERY_MS);
          }),
        ]);
        profileRes = pair[0];
        rolesRes = pair[1];
      } catch (e) {
        console.warn("Direct profile/roles fetch failed or timed out, retrying profile API:", e);
        try {
          return await fetchProfileAndRolesFromApi();
        } catch (err) {
          console.warn("Profile API fallback failed:", err);
          return { profile: null, roles: [] as UserRole[] };
        }
      }

      const profile = profileRes.error ? null : profileRes.data;
      const roleRows = (rolesRes.data ?? []) as { role_id: string; roles: { name: string } | null }[];
      const roles = toUserRoles(roleRows);

      if (rolesRes.error) {
        console.warn("Direct role fetch failed, falling back to profile API:", rolesRes.error.message);
      }

      // Browser-side role join can still return empty because of RLS/permission differences.
      if (rolesRes.error || roles.length === 0) {
        try {
          const apiData = await fetchProfileAndRolesFromApi();
          if (apiData.roles.length > 0 || apiData.profile) {
            return apiData;
          }
        } catch (err) {
          console.warn("Profile API fallback failed:", err);
        }
      }

      return { profile, roles };
    },
    [fetchProfileAndRolesFromApi, supabase]
  );

  const syncAuthState = useCallback(
    async (
      source: string,
      preferred?: {
        session?: Session | null;
        user?: User | null;
      },
      options?: { silent?: boolean }
    ) => {
      const requestId = ++syncRequestRef.current;

      // silent=true: keeps the existing UI visible during background refreshes so the
      // dashboard never flashes a loading spinner (e.g. online-recovery, USER_UPDATED).
      if (!options?.silent) {
        setState((current) => ({ ...current, isLoading: true }));
      }

      authDebug("provider", `sync start: ${source}`, {
        requestId,
        silent: Boolean(options?.silent),
        preferredUserId: preferred?.user?.id ?? preferred?.session?.user?.id ?? null,
      });

      try {
        let session = preferred?.session ?? null;
        let user = preferred?.user ?? session?.user ?? null;

        if (!user) {
          const resolved = await resolveSessionUser();
          session = resolved.session ?? session;
          user = resolved.user;
        }

        if (!user) {
          if (syncRequestRef.current !== requestId) {
            return null;
          }

          currentUserIdRef.current = null;
          setState((current) => ({
            user: null,
            session: null,
            profile: null,
            roles: [],
            isLoading: false,
            isInitialized: true,
            authVersion: current.authVersion + 1,
          }));
          authDebug("provider", `sync anonymous: ${source}`, { requestId });
          return { user: null, session: null, profile: null, roles: [] as UserRole[] };
        }

        const { profile, roles } = await fetchProfileAndRoles(user.id);
        if (syncRequestRef.current !== requestId) {
          return null;
        }

        const { data: { session: latestSession } } = await supabase.auth.getSession();
        const sessionToStore = latestSession ?? session;

        currentUserIdRef.current = user.id;
        setState((current) => ({
          user,
          session: sessionToStore,
          profile,
          roles,
          isLoading: false,
          isInitialized: true,
          // Only bump when this sync was user-visible — silent refreshes should not
          // re-trigger every dashboard `useEffect([authVersion])` data load.
          authVersion: options?.silent ? current.authVersion : current.authVersion + 1,
        }));
        authDebug("provider", `sync success: ${source}`, {
          requestId,
          userId: user.id,
          roles: getRoleNames(roles),
          hasSession: Boolean(sessionToStore),
        });

        return { user, session: sessionToStore, profile, roles };
      } catch (err) {
        if (syncRequestRef.current !== requestId) {
          return null;
        }

        console.error("Refresh profile error:", err);
        authDebug("provider", `sync error: ${source}`, {
          requestId,
          error: err instanceof Error ? err.message : String(err),
        });

        // If already authenticated, preserve the existing session on transient errors
        // (e.g. network flap). Clearing state here would log the user out on any
        // temporary connectivity issue — which is unacceptable for a CRM dashboard.
        setState((current) => {
          if (current.isInitialized && current.user !== null) {
            authDebug("provider", `sync error - preserving existing session: ${source}`, { requestId });
            return { ...current, isLoading: false };
          }
          // Initial load failed — no session to preserve.
          currentUserIdRef.current = null;
          return {
            user: null,
            session: null,
            profile: null,
            roles: [],
            isLoading: false,
            isInitialized: true,
            authVersion: current.authVersion + 1,
          };
        });

        return null;
      }
    },
    [fetchProfileAndRoles, resolveSessionUser, supabase]
  );

  const refreshProfile = useCallback(async () => {
    // Always silent — the user is already viewing the dashboard, no spinner needed.
    await syncAuthState("manual-refresh", undefined, { silent: true });
  }, [syncAuthState]);

  const waitForSessionConfirmation = useCallback(
    async (expectedUserId: string, timeoutMs = 1_500) => {
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeoutMs) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id === expectedUserId) {
          return session;
        }

        await wait(150);
      }

      return null;
    },
    [supabase]
  );

  useEffect(() => {
    let mounted = true;
    let initSettled = false;

    const init = async () => {
      // Hard fallback: if the full sync hangs (Supabase navigator.locks
      // contention or slow network), unblock useAuthReady after the timeout so
      // pages can still attempt their own fetches (fetchWithAuthRetry handles
      // transient 401s). The sync continues in the background.
      const fallbackTimer = setTimeout(() => {
        if (initSettled || !mounted) return;
        console.warn(
          `[auth] init exceeded ${INIT_FALLBACK_TIMEOUT_MS}ms — unblocking UI; sync continues in background`
        );
        void (async () => {
          let lateSession: Session | null = null;
          try {
            const { data } = await supabase.auth.getSession();
            lateSession = data.session ?? null;
          } catch {
            // ignore
          }
          if (!mounted) return;
          setState((current) => ({
            ...current,
            isLoading: false,
            isInitialized: true,
            ...(lateSession?.user && !current.user
              ? { user: lateSession.user, session: lateSession }
              : {}),
          }));
        })();
      }, INIT_FALLBACK_TIMEOUT_MS);

      try {
        if (typeof window !== "undefined" && typeof navigator !== "undefined" && !navigator.onLine) {
          setState((current) => ({
            user: null,
            session: null,
            profile: null,
            roles: [],
            isLoading: false,
            isInitialized: true,
            authVersion: current.authVersion + 1,
          }));
          authDebug("provider", "init offline - starting anonymous");
          return;
        }

        // ── FAST PATH ─────────────────────────────────────────────────────────
        // Read the session directly from the in-memory / localStorage store.
        // This is synchronous-ish (~1 ms) — no network call. If a session exists,
        // we flip `isInitialized: true` immediately so the dashboard layout can
        // render its shell and pages can show their own skeletons while the full
        // server-validated sync (getUser + profile DB queries) runs below.
        // `isLoading` stays `true` so `useAuthReady` keeps pages from firing real
        // data fetches until the profile/roles are confirmed.
        if (typeof window !== "undefined") {
          let quickSession: Session | null = null;
          for (let attempt = 0; attempt < 5; attempt++) {
            const { data: { session: s } } = await supabase.auth.getSession();
            if (s?.user) {
              quickSession = s;
              break;
            }
            await wait(50);
            if (!mounted) return;
          }
          if (quickSession?.user && mounted) {
            setState((current) => ({
              ...current,
              user: quickSession!.user,
              session: quickSession,
              // keep isLoading: true — useAuthReady will stay false until the
              // full sync below sets it to false with validated profile + roles.
              isInitialized: true,
            }));
            authDebug("provider", "init fast-path: session from storage", {
              userId: quickSession.user.id,
            });
          }
        }
        // ── END FAST PATH ─────────────────────────────────────────────────────

        await syncAuthState("init");
      } catch (err) {
        console.error("Auth init error:", err);
        if (!mounted) return;
        setState((current) => ({
          user: null,
          session: null,
          profile: null,
          roles: [],
          isLoading: false,
          isInitialized: true,
          authVersion: current.authVersion + 1,
        }));
      } finally {
        initSettled = true;
        clearTimeout(fallbackTimer);
      }
    };

    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      authDebug("provider", `auth event: ${event}`, {
        hasSession: Boolean(session),
        userId: session?.user?.id ?? null,
        currentUserId: currentUserIdRef.current,
      });

      if (event === "SIGNED_OUT") {
        currentUserIdRef.current = null;
        setState((current) => ({
          user: null,
          session: null,
          profile: null,
          roles: [],
          isLoading: false,
          isInitialized: true,
          authVersion: current.authVersion + 1,
        }));
        return;
      }

      if (event === "INITIAL_SESSION") {
        // Handled by init() above — skip to avoid a duplicate full sync on mount.
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        // A token refresh only rotates the JWT — the user's identity and roles are
        // unchanged. Patch the session silently so the dashboard never flashes a
        // loading spinner when the browser refreshes the token (e.g. on tab switch).
        // Do not bump `authVersion` — same-origin fetches use cookies; refetching
        // every list/overview on each rotation caused visible reload churn.
        authDebug("provider", "TOKEN_REFRESHED - silent session update", {
          userId: session?.user?.id,
        });
        setState((current) =>
          current.isInitialized
            ? {
                ...current,
                session,
                user: session?.user ?? current.user,
              }
            : current
        );
        return;
      }

      if (event === "SIGNED_IN") {
        // Always patch silently when the user matches the current session.
        // This covers:
        //   1. The post-signIn() SIGNED_IN echo — signIn() already ran syncAuthState
        //      and set currentUserIdRef. Re-running a full (non-silent) sync here
        //      would set isLoading:true again, causing useAuthReady to flip false
        //      and blocking all dashboard API calls until the stuck-loading timer.
        //   2. Cross-tab token sync / bfcache restore.
        if (session?.user?.id && session.user.id === currentUserIdRef.current) {
          authDebug("provider", "SIGNED_IN - same user, silent session patch", {
            userId: session.user.id,
          });
          setState((current) => ({
            ...current,
            session,
            user: session.user ?? current.user,
          }));
          return;
        }

        // Genuinely different user (account switch in another tab, etc.).
        // Full sync is correct here — this is not the post-login echo path.
        authDebug("provider", "SIGNED_IN - new user, full sync", {
          userId: session?.user?.id,
        });
        await syncAuthState(`event:${event}`, {
          session,
          user: session?.user ?? null,
        });
        return;
      }

      if (event === "USER_UPDATED") {
        // User metadata changed. If it's the same user, re-fetch profile silently
        // (no loading spinner). If somehow a different user, do a full sync.
        const isSameUser = session?.user?.id === currentUserIdRef.current;
        authDebug("provider", `USER_UPDATED - ${isSameUser ? "silent" : "full"} sync`, {
          userId: session?.user?.id,
        });
        await syncAuthState(
          `event:${event}`,
          { session, user: session?.user ?? null },
          { silent: isSameUser }
        );
      }
    });

    // When the browser comes back online, proactively refresh the profile/session.
    // Use silent mode so the dashboard stays visible during the background re-sync.
    const handleOnline = () => {
      if (!mounted) return;
      authDebug("provider", "network online - silent background refresh");
      void refreshProfile().catch((err) => {
        console.error("Auth online refresh error:", err);
      });
    };

    // When the tab returns to the foreground after being hidden long enough that
    // the access token may have rotated in another tab (or expired), silently
    // re-sync. This does not bump `authVersion` (silent sync) so lists keep cached UI.
    let hiddenAt: number | null =
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? Date.now()
        : null;
    const handleVisibility = () => {
      if (!mounted || typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // visible
      const hiddenFor = hiddenAt ? Date.now() - hiddenAt : Infinity;
      hiddenAt = null;
      if (hiddenFor < VISIBILITY_MIN_HIDDEN_MS) return;
      authDebug("provider", "tab visible after hidden - silent background refresh", {
        hiddenForMs: hiddenFor,
      });
      void refreshProfile().catch((err) => {
        console.error("Auth visibility refresh error:", err);
      });
    };

    // Cross-tab: when another tab writes the Supabase auth tokens to localStorage
    // (login, logout, or refresh on clients still using the localStorage adapter),
    // re-sync this tab silently. Cookie-based sessions are already shared across
    // tabs automatically; this primarily covers the localStorage path.
    const handleStorage = (e: StorageEvent) => {
      if (!mounted || !e.key) return;
      const key = e.key;
      const isSupabaseKey =
        key.startsWith("sb-") || key.toLowerCase().includes("supabase");
      if (!isSupabaseKey) return;
      authDebug("provider", "cross-tab supabase storage change - silent refresh", {
        key,
      });
      void refreshProfile().catch((err) => {
        console.error("Auth storage refresh error:", err);
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("storage", handleStorage);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("storage", handleStorage);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [supabase, refreshProfile, syncAuthState]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
      return;
    }
    const bc = new BroadcastChannel(AUTH_SIGNOUT_BROADCAST_CHANNEL);
    bc.onmessage = (ev: MessageEvent) => {
      if (ev.data !== "signed-out") return;
      authDebug("provider", "cross-tab sign-out broadcast — hard navigation to login");
      window.location.replace(`${window.location.origin}/login?signedOut=1`);
    };
    return () => bc.close();
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, requestedRedirectPath?: string) => {
      setState((current) => ({ ...current, isLoading: true }));
      authDebug("provider", "signIn start", { email });

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setState((current) => ({ ...current, isLoading: false, isInitialized: true }));
          return { error: error as Error };
        }

        if (data.user) {
          // Drop any in-flight getUser() from a previous session so the next validation
          // is not tied to a stale promise after account switches.
          getUserInFlightRef.current = null;
          await supabase.auth.getSession();

          // Check if account is active before proceeding
          try {
            const profileCheck = await fetch("/api/profile", {
              method: "GET",
              credentials: "include",
              cache: "no-store",
            });
            if (profileCheck.status === 403) {
              const profileData = await profileCheck.json() as { error?: string };
              await supabase.auth.signOut({ scope: "local" });
              setState((current) => ({ ...current, isLoading: false, isInitialized: true }));
              return {
                error: new Error(
                  profileData.error ?? "Your account has been deactivated. Contact your Team Leader."
                ),
              };
            }
          } catch {
            // Non-fatal — proceed with normal sync
          }

          const confirmedSession =
            data.session?.user?.id === data.user.id
              ? data.session
              : await waitForSessionConfirmation(data.user.id);

          // Pass silent:true so isLoading stays false after this sync completes.
          // The SIGNED_IN event echo from supabase.auth.signInWithPassword will
          // fire after this returns — it must NOT re-set isLoading:true.
          // currentUserIdRef is set inside syncAuthState, so the SIGNED_IN handler
          // will see the same userId and take the silent patch path.
          const resolved = await syncAuthState("signIn", {
            session: confirmedSession,
            user: data.user,
          }, { silent: false });

          if (!resolved?.user) {
            return {
              error: new Error("Sign-in succeeded but the session could not be restored."),
            };
          }

          // Audit log after sync so REST uses the same JWT as the validated session.
          void (async () => {
            await supabase.auth.getSession();
            await supabase
              .from("login_logs")
              .insert({
                user_id: data.user.id,
                ip_address: null,
                device_info:
                  typeof navigator !== "undefined" ? navigator.userAgent : null,
              } as never);
          })().catch(() => {});

          const redirectPath = resolvePostLoginRedirect({
            requestedPath: requestedRedirectPath,
            storedPath: getStoredRedirectPath(),
            roleNames: getRoleNames(resolved.roles),
          });

          const mfaStatus = await fetchMfaStatus();
          let deviceStatus = null;
          if (!mfaStatus?.needsSetup && !mfaStatus?.needsChallenge) {
            deviceStatus = await ensureDeviceRegistered();
          }
          const finalPath = resolvePostAuthPath(redirectPath, mfaStatus, deviceStatus);

          persistRedirectPath(finalPath);
          authDebug("provider", "signIn success", {
            userId: resolved.user.id,
            redirectPath: finalPath,
            roles: getRoleNames(resolved.roles),
          });

          return { error: null, redirectPath: finalPath };
        }

        // No error and no user (unexpected but handle gracefully)
        setState((current) => ({ ...current, isLoading: false, isInitialized: true }));
        return { error: new Error("Authentication did not return a user.") };
      } catch (err) {
        console.error("Auth signIn error:", err);
        setState((current) => ({ ...current, isLoading: false, isInitialized: true }));
        return { error: err as Error };
      }
    },
    [supabase, syncAuthState, waitForSessionConfirmation]
  );

  const signOut = useCallback(async () => {
    authDebug("provider", "signOut start");
    getUserInFlightRef.current = null;
    syncRequestRef.current++; // cancel any in-flight syncAuthState
    currentUserIdRef.current = null;

    // 1. Clear React state immediately so UI reflects signed-out instantly
    setState({
      user: null,
      session: null,
      profile: null,
      roles: [],
      isInitialized: true,
      isLoading: false,
      authVersion: 0,
    });

    // 2. Wipe all client-side storage + reset Supabase singleton BEFORE any
    //    async calls so nothing can read stale state during the network phase
    clearClientStorage();

    // 3. Server: clear HttpOnly session cookies
    try {
      await fetch(`${window.location.origin}/api/auth/signout`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch (err) {
      console.error("Server signOut error:", err);
    }

    // 4. GoTrue: invalidate the refresh token server-side (best-effort)
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      // Ignore — client singleton is already reset, cookies already cleared
    }

    // 5. Notify other tabs
    broadcastAuthSignedOut();

    authDebug("provider", "signOut complete");

    // 6. Hard navigate to login — fresh page load with clean state
    window.location.replace(`${window.location.origin}/login`);
  }, [supabase]);

  const hasRole = useCallback(
    (roleName: string) => {
      const normalized = normalizeRoleName(roleName);
      return state.roles.some((r) => {
        const rNormalized = normalizeRoleName(r.role_name);
        return rNormalized === normalized || r.role_name?.toLowerCase() === roleName.toLowerCase();
      });
    },
    [state.roles]
  );

  const getDefaultRedirect = useCallback(() => {
    return getDefaultRedirectPath(getRoleNames(state.roles));
  }, [state.roles]);

  const hasTLAccess = useCallback(() => {
    const guardRoles = getTLGuardRoles();
    return state.roles.some((r) =>
      guardRoles.includes(normalizeRoleName(r.role_name))
    );
  }, [state.roles]);

  const hasSTLAccess = useCallback(() => {
    const guardRoles = getSTLGuardRoles();
    return state.roles.some((r) =>
      guardRoles.includes(normalizeRoleName(r.role_name))
    );
  }, [state.roles]);

  const value: AuthContextValue = {
    ...state,
    signIn,
    signOut,
    refreshProfile,
    hasRole,
    getDefaultRedirect,
    hasTLAccess,
    hasSTLAccess,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
