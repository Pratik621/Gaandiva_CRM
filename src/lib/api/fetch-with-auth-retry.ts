import { createClient } from "@/lib/supabase/client";

/**
 * Same-origin authenticated fetch tuned for browser quirks that show up in
 * production Chrome / multi-tab sessions:
 *
 *  - Per-attempt timeout via AbortController — protects against fetches that
 *    silently hang (e.g. when the middleware is briefly serialized behind a
 *    cross-tab Supabase lock or a slow upstream).
 *  - Exponential backoff on transient auth (401/403) and server (5xx) responses
 *    and on network errors.
 *  - Between auth retries, asks supabase-js to re-read its session. This is the
 *    cheapest way to nudge the SDK into picking up freshly-rotated cookies that
 *    the server already saw but the in-memory client has not synced yet.
 */

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_PER_ATTEMPT_TIMEOUT_MS = 15_000;
const BASE_BACKOFF_MS = 150;
const MAX_BACKOFF_MS = 2_000;

export interface FetchWithAuthRetryOptions extends RequestInit {
  /** Total attempts including the first one. Default: 5. */
  maxAttempts?: number;
  /** Abort each attempt after this many ms. Default: 15_000. */
  perAttemptTimeoutMs?: number;
}

export async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init: FetchWithAuthRetryOptions = {}
): Promise<Response> {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    perAttemptTimeoutMs = DEFAULT_PER_ATTEMPT_TIMEOUT_MS,
    signal: callerSignal,
    ...restInit
  } = init;

  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (callerSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (attempt > 0) {
      const backoff = Math.min(
        BASE_BACKOFF_MS * 2 ** (attempt - 1),
        MAX_BACKOFF_MS
      );
      await sleep(backoff, callerSignal ?? undefined);

      // Nudge supabase-js to re-read its session from storage/cookies. This is
      // a no-op when the session is fresh, but recovers the multi-tab case
      // where another tab has just rotated the JWT and our in-memory copy is
      // stale. We deliberately do not await refreshSession() here — that is
      // heavyweight and would defeat the per-attempt timeout. A getSession()
      // call is enough to trigger the SDK's storage adapter.
      try {
        const supabase = createClient();
        await supabase.auth.getSession();
      } catch {
        // Ignore — worst case we just retry with the old token.
      }
    }

    const timeoutCtrl = new AbortController();
    const timeoutHandle = setTimeout(
      () => timeoutCtrl.abort(new DOMException("Timeout", "TimeoutError")),
      perAttemptTimeoutMs
    );
    const onCallerAbort = () => timeoutCtrl.abort(callerSignal!.reason);
    if (callerSignal) {
      if (callerSignal.aborted) timeoutCtrl.abort(callerSignal.reason);
      else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }

    try {
      lastResponse = await fetch(input, {
        ...restInit,
        credentials: restInit.credentials ?? "include",
        cache: restInit.cache ?? "no-store",
        signal: timeoutCtrl.signal,
      });
    } catch (err) {
      lastError = err;
      // Caller-driven abort: bubble up immediately.
      if (callerSignal?.aborted) throw err;
      // Otherwise this is a network error or our own timeout — retry.
      continue;
    } finally {
      clearTimeout(timeoutHandle);
      if (callerSignal) {
        callerSignal.removeEventListener("abort", onCallerAbort);
      }
    }

    // Retry transient auth / server errors. Everything else (2xx/3xx/4xx) we
    // surface to the caller so it can handle 404/400/etc. without delay.
    const status = lastResponse.status;
    const isRetryable =
      status === 401 || status === 403 || (status >= 500 && status <= 599);
    if (!isRetryable) return lastResponse;
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("fetchWithAuthRetry: request failed with no response");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
