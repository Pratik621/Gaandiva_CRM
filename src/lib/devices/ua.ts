export type ParsedUserAgent = {
  browser: string;
  os: string;
  deviceName: string;
};

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const raw = (ua ?? "").trim();
  if (!raw) {
    return { browser: "Unknown", os: "Unknown", deviceName: "Unknown device" };
  }

  let browser = "Unknown";
  if (/Edg\//i.test(raw)) browser = "Edge";
  else if (/OPR\//i.test(raw) || /Opera/i.test(raw)) browser = "Opera";
  else if (/Chrome\//i.test(raw) && !/Chromium/i.test(raw)) browser = "Chrome";
  else if (/Safari\//i.test(raw) && !/Chrome/i.test(raw)) browser = "Safari";
  else if (/Firefox\//i.test(raw)) browser = "Firefox";
  else if (/MSIE|Trident/i.test(raw)) browser = "IE";

  let os = "Unknown";
  if (/Windows NT/i.test(raw)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(raw)) os = "macOS";
  else if (/Android/i.test(raw)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(raw)) os = "iOS";
  else if (/Linux/i.test(raw)) os = "Linux";
  else if (/CrOS/i.test(raw)) os = "ChromeOS";

  return {
    browser,
    os,
    deviceName: `${browser} on ${os}`,
  };
}

export function approximateLocationFromHeaders(headers: Headers): string {
  const city = headers.get("x-vercel-ip-city")?.trim();
  const region = headers.get("x-vercel-ip-country-region")?.trim();
  const country = headers.get("x-vercel-ip-country")?.trim();

  const parts = [city, region, country].filter(Boolean).map((p) => decodeURIComponent(p!));
  if (parts.length === 0) return "Unknown";
  // Prefer "City, Country" when both exist
  if (city && country) return `${decodeURIComponent(city)}, ${country}`;
  return parts.join(", ");
}
