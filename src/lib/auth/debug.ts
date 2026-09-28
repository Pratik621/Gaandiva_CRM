import { AUTH_STORAGE_KEYS } from "@/lib/auth/config";

type AuthDebugDetails = Record<string, unknown> | string | number | boolean | null | undefined;

function isEnvEnabled() {
  return process.env.NEXT_PUBLIC_AUTH_DEBUG === "true";
}

export function isAuthDebugEnabled() {
  if (isEnvEnabled()) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEYS.debug) === "1";
  } catch {
    return false;
  }
}

export function authDebug(scope: string, message: string, details?: AuthDebugDetails) {
  if (!isAuthDebugEnabled()) {
    return;
  }

  if (details === undefined) {
    console.debug(`[auth:${scope}] ${message}`);
    return;
  }

  console.debug(`[auth:${scope}] ${message}`, details);
}
