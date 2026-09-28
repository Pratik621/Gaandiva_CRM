// Thin Meta Graph API client shared by the Lead Ads pull (meta-lead-sync)
// and the Conversions API push (meta-conversions). Server-only: every call
// carries the org's access token.

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || "v26.0";
export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Meta's OAuth error code — the token itself is invalid/expired/malformed. */
export const INVALID_TOKEN_CODE = 190;

export class MetaGraphError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

export interface GraphPage<T> {
  data: T[];
  paging?: { next?: string };
}

async function graphFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const json = (await response.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!response.ok || json.error) {
    throw new MetaGraphError(
      json.error?.message || `Meta API request failed (HTTP ${response.status})`,
      json.error?.code
    );
  }
  return json;
}

export function graphGet<T>(path: string, accessToken: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH_BASE_URL}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", accessToken);
  return graphFetch<T>(url.toString());
}

export function graphPost<T>(path: string, accessToken: string, body: string): Promise<T> {
  const url = new URL(`${GRAPH_BASE_URL}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", accessToken);
  return graphFetch<T>(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

/** Follows `paging.next` until exhausted (the next URL already carries the token). */
export async function graphGetAll<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const items: T[] = [];
  let page = await graphGet<GraphPage<T>>(path, accessToken, params);
  items.push(...(page.data ?? []));
  while (page.paging?.next) {
    page = await graphFetch<GraphPage<T>>(page.paging.next);
    items.push(...(page.data ?? []));
  }
  return items;
}

export interface ResolvedMetaPage {
  pageId: string;
  pageName: string | null;
  pageToken: string;
}

export interface MetaPageCandidate {
  id: string;
  name: string | null;
  access_token?: string;
}

/** A Page ID that isn't a Facebook Page this token can reach (typo, a user/System User id, …). */
export class MetaPageNotFoundError extends MetaGraphError {
  constructor(message: string, readonly discoveredPages: MetaPageCandidate[]) {
    super(message);
  }
}

type PageRow = { id: string; name?: string; access_token?: string };

/** Confirms `id` is a Facebook Page (only Pages have `category`) — never a user / System User. */
async function fetchPage(id: string, accessToken: string): Promise<MetaPageCandidate | null> {
  try {
    const page = await graphGet<PageRow & { category?: string }>(id, accessToken, { fields: "id,name,category" });
    if (!page.category) return null;
    return { id: page.id, name: page.name ?? null };
  } catch {
    return null;
  }
}

async function pagesFromEdge(path: string, accessToken: string): Promise<PageRow[]> {
  try {
    return await graphGetAll<PageRow>(path, accessToken, { fields: "id,name,access_token", limit: "100" });
  } catch {
    // access_token isn't readable on every edge / token — the page list still is.
    return graphGetAll<PageRow>(path, accessToken, { fields: "id,name", limit: "100" }).catch(() => []);
  }
}

/**
 * Every Facebook Page this token can reach, straight from Meta:
 *  - /me/accounts                      Pages assigned to the user / System User
 *  - /me/businesses → /{id}/owned_pages Pages owned by the token's Business
 *    (a System User's Page often only shows up here)
 *  - /me itself, only when the token is a Page token (verified via `category`)
 * The token owner's own id is never returned as a Page.
 */
export async function discoverMetaPages(accessToken: string): Promise<MetaPageCandidate[]> {
  const pages = new Map<string, MetaPageCandidate>();
  const add = (rows: PageRow[]) => {
    for (const row of rows) {
      const existing = pages.get(row.id);
      pages.set(row.id, {
        id: row.id,
        name: row.name ?? existing?.name ?? null,
        access_token: row.access_token || existing?.access_token,
      });
    }
  };

  add(await pagesFromEdge("me/accounts", accessToken));

  const businesses = await graphGetAll<{ id: string }>("me/businesses", accessToken, { fields: "id", limit: "100" }).catch(
    () => []
  );
  for (const business of businesses) {
    add(await pagesFromEdge(`${business.id}/owned_pages`, accessToken));
  }

  if (pages.size === 0) {
    const self = await fetchPage("me", accessToken);
    if (self) add([{ id: self.id, name: self.name ?? undefined, access_token: accessToken }]);
  }

  return [...pages.values()];
}

function describePages(pages: MetaPageCandidate[]): string {
  return pages.map((p) => `${p.name ?? "Page"} (${p.id})`).join(", ");
}

/**
 * The Page's own access token (what /leadgen_forms and /leads expect), or
 * the original token when Meta doesn't hand one out — e.g. a System User
 * token with direct Page permissions already works as-is.
 */
async function withPageToken(page: MetaPageCandidate, accessToken: string): Promise<ResolvedMetaPage> {
  let pageToken = page.access_token;
  if (!pageToken) {
    pageToken = await graphGet<{ access_token?: string }>(page.id, accessToken, { fields: "access_token" })
      .then((r) => r.access_token)
      .catch(() => undefined);
  }
  return { pageId: page.id, pageName: page.name, pageToken: pageToken || accessToken };
}

/**
 * Resolves the Facebook Page to read leads from, always verified against
 * Meta. With a pageId it must be a real Page this token can reach; without
 * one, the token must reach exactly one Page. Throws MetaPageNotFoundError
 * (listing the Pages Meta did return) instead of ever guessing.
 */
export async function resolveMetaPage(accessToken: string, pageId?: string | null): Promise<ResolvedMetaPage> {
  const discovered = await discoverMetaPages(accessToken);

  if (pageId) {
    const listed = discovered.find((p) => p.id === pageId);
    if (listed) return withPageToken(listed, accessToken);
    const direct = await fetchPage(pageId, accessToken);
    if (direct) return withPageToken(direct, accessToken);
    throw new MetaPageNotFoundError(
      `${pageId} is not a Facebook Page this token can access.` +
        (discovered.length ? ` Pages available: ${describePages(discovered)}.` : ""),
      discovered
    );
  }

  if (discovered.length === 1) return withPageToken(discovered[0], accessToken);
  if (discovered.length > 1) {
    throw new MetaPageNotFoundError(
      `This token can access ${discovered.length} Pages — enter the Page ID to use: ${describePages(discovered)}`,
      discovered
    );
  }
  throw new MetaPageNotFoundError(
    "This token has no access to any Facebook Page (checked /me/accounts and your Business's owned Pages). " +
      "Assign the Page to the System User in Business Settings and generate a new token.",
    discovered
  );
}

/**
 * Like resolveMetaPage, but self-correcting for a saved connection: when the
 * stored Page ID turns out not to be a reachable Page (a typo, or an old row
 * that stored the token owner's id), fall back to the Page Meta discovers.
 */
export async function resolveStoredMetaPage(
  accessToken: string,
  storedPageId: string | null
): Promise<ResolvedMetaPage & { correctedFrom: string | null }> {
  try {
    return { ...(await resolveMetaPage(accessToken, storedPageId)), correctedFrom: null };
  } catch (err) {
    if (!(err instanceof MetaPageNotFoundError) || !storedPageId) throw err;
    const page = await resolveMetaPage(accessToken, null);
    return { ...page, correctedFrom: storedPageId };
  }
}
