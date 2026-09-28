export function resolveSidebarSelectedKey(
  pathname: string | null | undefined,
  items: { key: string }[],
  fallback: string
): string {
  if (!pathname) return fallback;

  const match = items
    .filter((item) => pathname === item.key || pathname.startsWith(`${item.key}/`))
    .sort((a, b) => b.key.length - a.key.length)[0];

  return match?.key ?? fallback;
}
