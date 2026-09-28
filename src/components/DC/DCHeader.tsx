"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/shared/GlobalSearch";
import ClientHeaderLogos, {
  resolveProfileClientLogoUrls,
} from "@/components/shared/ClientHeaderLogos";
import { useAuth } from "@/context/AuthContext";

export default function DCHeader() {
  const { profile } = useAuth();
  const clientLogoUrls = resolveProfileClientLogoUrls(
    profile as { client_logo_urls?: unknown; client_logo_url?: string | null } | null
  );

  const trailingSlot =
    clientLogoUrls.length > 0 ? <ClientHeaderLogos urls={clientLogoUrls} /> : null;

  return (
    <CrmHeader
      roleLabel="DC"
      fallbackName="DC"
      profilePath="/dc/profile"
      showSettings={false}
      search={<GlobalSearch />}
      trailingSlot={trailingSlot}
    />
  );
}
