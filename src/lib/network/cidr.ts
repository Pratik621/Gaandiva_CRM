/**
 * Minimal IPv4 CIDR matching — pure JS so it runs in Edge middleware.
 * Non-IPv4 entries (e.g. IPv6) fall back to exact string comparison.
 */

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function ipv4ToLong(ip: string): number | null {
  const match = IPV4_RE.exec(ip.trim());
  if (!match) return null;
  let out = 0;
  for (let i = 1; i <= 4; i++) {
    const octet = Number(match[i]);
    if (octet < 0 || octet > 255) return null;
    out = out * 256 + octet;
  }
  return out;
}

/** Validate an allowlist entry: IPv4, IPv4/prefix, or a literal IPv6 string. */
export function isValidCidr(entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed) return false;
  const [ip, prefix, extra] = trimmed.split("/");
  if (extra !== undefined) return false;

  if (ipv4ToLong(ip) !== null) {
    if (prefix === undefined) return true; // bare IPv4 = /32
    const bits = Number(prefix);
    return Number.isInteger(bits) && bits >= 8 && bits <= 32;
  }
  // IPv6 (exact-match only): very light validation.
  return prefix === undefined && trimmed.includes(":");
}

/** True when `ip` falls inside `cidr` (IPv4 CIDR or exact string match). */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const trimmedIp = ip.trim();
  const trimmedCidr = cidr.trim();
  if (!trimmedIp || !trimmedCidr) return false;

  const [base, prefixRaw] = trimmedCidr.split("/");
  const ipLong = ipv4ToLong(trimmedIp);
  const baseLong = ipv4ToLong(base);

  if (ipLong === null || baseLong === null) {
    // IPv6 / non-IPv4 entries: exact match only.
    return trimmedIp.toLowerCase() === trimmedCidr.toLowerCase();
  }

  const bits = prefixRaw === undefined ? 32 : Number(prefixRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;

  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipLong & mask) >>> 0) === ((baseLong & mask) >>> 0);
}

export function ipMatchesAnyCidr(ip: string | null, cidrs: string[]): boolean {
  if (!ip) return false;
  return cidrs.some((cidr) => ipMatchesCidr(ip, cidr));
}
