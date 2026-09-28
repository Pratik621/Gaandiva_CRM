/**
 * Expires visible Supabase auth cookies on the current document.
 * @supabase/ssr mostly uses httpOnly cookies (server/middleware clears those),
 * but any readable chunks or mis-synced pairs should still be removed here.
 */
function supabaseProjectRefFromUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const host = new URL(url).hostname;
    const m = host.match(/^([^.]+)\.supabase\.co$/);
    return m?.[1] ?? "";
  } catch {
    return "";
  }
}

export function purgeSupabaseAuthCookiesFromDocument(): void {
  if (typeof document === "undefined") return;

  const expire = (name: string) => {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  };

  const names = document.cookie
    .split(";")
    .map((c) => c.trim().split("=")[0])
    .filter((n): n is string => Boolean(n));

  const ref = supabaseProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!ref) {
    for (const name of names) {
      if (name.startsWith("sb-")) expire(name);
    }
    return;
  }

  const prefix = `sb-${ref}-`;

  for (const name of names) {
    if (name.startsWith(prefix)) {
      expire(name);
    }
  }

  const base = `${prefix}auth-token`;
  expire(base);
  for (let i = 0; i < 24; i++) {
    expire(`${base}.${i}`);
  }
  expire(`${base}-code-verifier`);
}
