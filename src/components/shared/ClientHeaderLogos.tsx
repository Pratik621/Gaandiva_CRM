"use client";

type Props = {
  urls: string[];
};

/** Side-by-side client logos for dashboard header (client_viewer / DC). */
export default function ClientHeaderLogos({ urls }: Props) {
  if (urls.length === 0) return null;

  return (
    <div
      className="crm-header__client-logos"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexShrink: 0,
        maxWidth: 420,
        overflow: "hidden",
      }}
    >
      {urls.map((url, index) => (
        <img
          key={`${url}-${index}`}
          src={url}
          alt={urls.length === 1 ? "Client logo" : `Client logo ${index + 1}`}
          className="crm-header__client-logo"
          style={{
            height: 36,
            maxWidth: urls.length === 1 ? 160 : 120,
            width: "auto",
            objectFit: "contain",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

/** Resolve logo URL list from profile (supports legacy single + multi). */
export function resolveProfileClientLogoUrls(
  profile: { client_logo_urls?: unknown; client_logo_url?: string | null } | null | undefined
): string[] {
  if (!profile) return [];
  if (Array.isArray(profile.client_logo_urls)) {
    const urls = profile.client_logo_urls.filter(
      (u): u is string => typeof u === "string" && u.trim().length > 0
    );
    if (urls.length > 0) return urls;
  }
  const single = typeof profile.client_logo_url === "string" ? profile.client_logo_url.trim() : "";
  return single ? [single] : [];
}
