/**
 * Normalize phone numbers for WhatsApp / MSG91 (digits only, with country code).
 *
 * Indian mobiles are always 10 digits starting with 6–9 (including 9665xxxxxxxx).
 * Do NOT treat 10-digit numbers as Saudi (+966) — prepend 91 for India.
 */
export function normalizeWhatsAppRecipient(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;

  // Already has country code (91xxxxxxxxxx = 12 digits, 9665xxxxxxxx = 12, etc.)
  if (digits.length >= 12) return digits;

  // 11 digits starting with 91 — already Indian international
  if (digits.length === 11 && digits.startsWith("91")) return digits;

  // 10-digit Indian mobile (e.g. 9665666254, 9876543210) → always +91
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }

  // Other 11-digit or 10-digit international stored with country code in DB
  if (digits.length >= 11) return digits;

  return digits;
}

/** Only blocks if explicitly set in env (comma-separated country codes at start of number). */
export function getBlockedWhatsAppPrefixes(): string[] {
  const raw = process.env.WHATSAPP_MSG91_BLOCKED_PREFIXES?.trim();
  if (!raw || raw === "*") return [];
  return raw.split(",").map((s) => s.trim().replace(/\D/g, "")).filter(Boolean);
}

/** Returns user-facing error if recipient country prefix is blocked on MSG91. */
export function getBlockedPrefixError(recipient: string): string | null {
  const digits = recipient.replace(/\D/g, "");
  for (const prefix of getBlockedWhatsAppPrefixes()) {
    if (digits.startsWith(prefix)) {
      return (
        `WhatsApp to +${prefix} is blocked on your MSG91 account. ` +
        `Unblock in MSG91 settings or clear WHATSAPP_MSG91_BLOCKED_PREFIXES in .env.local.`
      );
    }
  }
  return null;
}
