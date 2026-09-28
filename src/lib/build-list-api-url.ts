/** Build a list API URL with page/limit and optional filters. */
export function buildListApiUrl(
  base: string,
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}
