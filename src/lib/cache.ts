/**
 * Tiny localStorage cache with TTL (tab reopen / instant paint).
 * Keys should be user-scoped where data is sensitive (see campaigns page).
 */

const DEFAULT_TTL_MINUTES = 5;

export const cache = {
  set<T>(key: string, data: T, ttlMinutes = DEFAULT_TTL_MINUTES): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          data,
          expiry: Date.now() + ttlMinutes * 60 * 1000,
        })
      );
    } catch {
      // Quota / private mode — ignore.
    }
  },

  get<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return null;
      const parsed = JSON.parse(item) as { data: T; expiry: number };
      if (!parsed || typeof parsed.expiry !== "number") return null;
      if (Date.now() > parsed.expiry) {
        window.localStorage.removeItem(key);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  },

  clear(key: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },

  /** Remove every key that starts with `prefix` (e.g. `gaandiva_campaigns:`). */
  clearByPrefix(prefix: string): void {
    if (typeof window === "undefined") return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // ignore
    }
  },
};

/** Prefix for Gandiv dashboard list caches (cleared on sign-out). */
export const GANDIV_CACHE_PREFIX = "gaandiva_";
