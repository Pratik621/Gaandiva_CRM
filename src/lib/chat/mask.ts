/** Build 2-letter initials from company name (never from personal name). */
export function companyInitials(companyName: string | null | undefined): string {
  const raw = (companyName ?? "").trim();
  if (!raw) return "??";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return raw.slice(0, 2).toUpperCase();
}

export function avatarHueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % 4;
  return h;
}

export function formatStage(status: string | null | undefined): string {
  if (!status) return "New";
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
