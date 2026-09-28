/** Shared helpers for QA recording download / ZIP filenames. */

const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "m4a", "ogg", "webm", "aac", "flac"]);

/** Agent / campaign segment: spaces → `-`, strip other specials. */
export function sanitizeRecordingNamePart(value: string | null | undefined): string {
  if (!value?.trim()) return "Unknown";
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "");
}

/**
 * Keep email in the filename but replace `@` and `.` with `_`
 * so Windows does not treat `.com` as the file extension.
 */
export function sanitizeRecordingEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  return email
    .trim()
    .replace(/[@.]/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Extension from storage object name; defaults to `wav`. */
export function getRecordingAudioExtension(originalName: string | null | undefined): string {
  if (!originalName?.includes(".")) return "wav";
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || !AUDIO_EXTENSIONS.has(ext)) return "wav";
  return ext;
}

/**
 * Final download name: `{agent}_{campaign}_{sanitizedEmail}_{date}.{ext}`
 * Email segment omitted when missing.
 */
export function buildRecordingDownloadFilename(parts: {
  agentName: string | null | undefined;
  campaignName: string | null | undefined;
  email: string | null | undefined;
  date: string | null | undefined;
  originalName: string | null | undefined;
}): string {
  const ext = getRecordingAudioExtension(parts.originalName);
  const base = [
    sanitizeRecordingNamePart(parts.agentName),
    sanitizeRecordingNamePart(parts.campaignName),
    sanitizeRecordingEmail(parts.email),
    parts.date?.trim() || "Unknown-Date",
  ]
    .filter(Boolean)
    .join("_");

  return `${base}.${ext}`;
}

/** Ensure a filename ends with a known audio extension (client safety net). */
export function ensureRecordingDownloadFilename(
  displayName: string,
  originalName: string | null | undefined
): string {
  const ext = getRecordingAudioExtension(originalName);
  const lower = displayName.toLowerCase();
  if (AUDIO_EXTENSIONS.has(lower.split(".").pop() ?? "")) {
    return displayName;
  }
  return `${displayName}.${ext}`;
}
