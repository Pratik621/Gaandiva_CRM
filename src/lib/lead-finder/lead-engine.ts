/**
 * Server-only Lead Finder engine client.
 * Credentials live in Vercel env vars — never NEXT_PUBLIC_*, never sent to the browser.
 * Vendor branding is stripped from user-facing errors only; env vars stay as configured.
 */

const ENGINE_API_BASE = "https://api.apify.com/v2";
/** Actor path uses ~ between user and name. Override via env if it changes. */
const DEFAULT_ACTOR_ID = "code_crafter~leads-finder";

const MAX_RETRIES = 3;

/** User-facing name for the underlying provider — keep vendor branding out of the UI. */
const ENGINE = "Lead engine";

export function getLeadEngineToken(): string | null {
  return process.env.APIFY_API_TOKEN?.trim() || null;
}

export function getActorId(): string {
  return process.env.APIFY_ACTOR_ID?.trim() || DEFAULT_ACTOR_ID;
}

export class LeadEngineError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Strip vendor URLs / brand names from upstream errors before they reach the UI.
 * Usage / billing failures become a clear, actionable message without external links.
 */
export function sanitizeLeadEngineMessage(raw: string, status?: number): string {
  const text = raw.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();

  const isUsage =
    status === 402 ||
    /exceed.*(usage|limit|quota|credit)/i.test(text) ||
    /insufficient.*(credit|usage|balance|fund)/i.test(text) ||
    /remaining usage/i.test(text) ||
    /upgrade.*(billing|subscription)/i.test(text);

  if (isUsage) {
    return "Insufficient Lead Finder credits to launch this search. Reduce the number of leads or top up the Lead Finder balance, then try again.";
  }

  if (status === 401 || /unauthorized|invalid.*(token|api.?key)/i.test(lower)) {
    return "Lead engine token is invalid. Check the Lead Finder API token on the server.";
  }

  if (status === 403 || /forbidden|access denied/i.test(lower)) {
    return "Lead engine denied this request. Check account access and try again.";
  }

  if (status === 429 || /rate.?limit/i.test(lower)) {
    return "Lead engine is rate-limiting requests. Wait a moment and try again.";
  }

  // Drop vendor hostnames / billing links from any leftover message.
  const cleaned = text
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[.,;:\s]+$/g, "")
    .trim();

  if (!cleaned || cleaned.length < 8) {
    return `Failed to reach the ${ENGINE.toLowerCase()} (${status ?? "error"}). Try again shortly.`;
  }

  return cleaned;
}

/** fetch with exponential backoff on 429/5xx (max 3 retries). */
async function engineFetch(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status >= 500) {
        lastError = new LeadEngineError(
          sanitizeLeadEngineMessage(`Lead engine responded ${res.status}`, res.status),
          res.status
        );
      } else {
        return res;
      }
    } catch (err) {
      lastError = err;
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new LeadEngineError("Lead engine request failed", 502);
}

export type LeadEngineRunInfo = {
  id: string;
  status: string; // READY | RUNNING | SUCCEEDED | FAILED | ABORTED | TIMED-OUT ...
  defaultDatasetId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

function toRunInfo(data: Record<string, unknown>): LeadEngineRunInfo {
  return {
    id: String(data.id ?? ""),
    status: String(data.status ?? "UNKNOWN"),
    defaultDatasetId: (data.defaultDatasetId as string | undefined) ?? null,
    startedAt: (data.startedAt as string | undefined) ?? null,
    finishedAt: (data.finishedAt as string | undefined) ?? null,
  };
}

function requireToken(): string {
  const token = getLeadEngineToken();
  if (!token) {
    throw new LeadEngineError(`${ENGINE} is not configured`, 503);
  }
  return token;
}

export async function startActorRun(
  input: Record<string, unknown>
): Promise<LeadEngineRunInfo> {
  const token = requireToken();

  const res = await engineFetch(
    `${ENGINE_API_BASE}/acts/${getActorId()}/runs?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    error?: { message?: string };
  };
  if (!res.ok || !json.data) {
    const raw = json.error?.message ?? `Failed to start the search (${res.status})`;
    throw new LeadEngineError(
      sanitizeLeadEngineMessage(raw, res.status),
      res.status === 401 ? 401 : res.status === 402 ? 402 : res.status >= 500 ? 502 : res.status
    );
  }
  return toRunInfo(json.data);
}

export async function getActorRun(engineRunId: string): Promise<LeadEngineRunInfo> {
  const token = requireToken();

  const res = await engineFetch(
    `${ENGINE_API_BASE}/actor-runs/${engineRunId}?token=${encodeURIComponent(token)}`
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    error?: { message?: string };
  };
  if (!res.ok || !json.data) {
    const raw = json.error?.message ?? `Failed to check search status (${res.status})`;
    throw new LeadEngineError(sanitizeLeadEngineMessage(raw, res.status), res.status);
  }
  return toRunInfo(json.data);
}

/** Dataset page (clean JSON items). */
export async function fetchDatasetItems(
  datasetId: string,
  offset: number,
  limit: number
): Promise<Record<string, unknown>[]> {
  const token = requireToken();

  const res = await engineFetch(
    `${ENGINE_API_BASE}/datasets/${datasetId}/items?format=json&clean=true&offset=${offset}&limit=${limit}&token=${encodeURIComponent(token)}`
  );
  if (!res.ok) {
    throw new LeadEngineError(
      sanitizeLeadEngineMessage(`Failed to fetch dataset items (${res.status})`, res.status),
      res.status
    );
  }
  const items = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

export async function getDatasetItemCount(datasetId: string): Promise<number | null> {
  const token = getLeadEngineToken();
  if (!token) return null;
  try {
    const res = await engineFetch(
      `${ENGINE_API_BASE}/datasets/${datasetId}?token=${encodeURIComponent(token)}`
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: { itemCount?: number };
    };
    return typeof json.data?.itemCount === "number" ? json.data.itemCount : null;
  } catch {
    return null;
  }
}
