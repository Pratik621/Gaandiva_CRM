/** Max logos stored per client (admin upload + header display). */
export const MAX_CLIENT_LOGOS = 5;

export type ClientLogoFields = {
  logo_url?: string | null;
  logo_urls?: string[] | null;
};

/** Prefer logo_urls; fall back to legacy logo_url when the array is empty/missing. */
export function normalizeClientLogoUrls(client: ClientLogoFields | null | undefined): string[] {
  if (!client) return [];
  const fromArray = (client.logo_urls ?? [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => u.length > 0);
  if (fromArray.length > 0) return fromArray;
  const single = typeof client.logo_url === "string" ? client.logo_url.trim() : "";
  return single ? [single] : [];
}

/** Keep logo_url in sync as the first logo for older readers (LHO PDF, etc.). */
export function primaryClientLogoUrl(urls: string[]): string | null {
  return urls[0] ?? null;
}
