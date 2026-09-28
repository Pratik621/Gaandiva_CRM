"use client";

import CrmHeader from "@/components/shared/CrmHeader";
import GlobalSearch from "@/components/Dashboard/GlobalSearch";
import ClientHeaderLogos, {
  resolveProfileClientLogoUrls,
} from "@/components/shared/ClientHeaderLogos";
import { useAuth } from "@/context/AuthContext";
import { COMMAND_CENTER_ROLES } from "@/lib/auth/config";

export default function DashboardHeader() {
  const { roles, profile, hasRole } = useAuth();

  const roleNames = roles.map((r) => r.role_name?.toLowerCase() ?? "");
  const isClientViewer = hasRole("client_viewer");
  const isCommandCenterUser = COMMAND_CENTER_ROLES.some((role) => hasRole(role));
  const clientLogoUrls = resolveProfileClientLogoUrls(
    profile as { client_logo_urls?: unknown; client_logo_url?: string | null } | null
  );

  const roleLabel = roleNames.includes("internal_admin")
    ? "Internal Admin"
    : roleNames.includes("internal_operator")
    ? "Internal Operator"
    : roleNames.includes("client_viewer")
      ? "Client Viewer"
      : roleNames.includes("admin")
        ? "Admin"
        : roleNames.length > 0
          ? roles[0]?.role_name ?? "User"
          : "User";

  const trailingSlot =
    isClientViewer && clientLogoUrls.length > 0 ? (
      <ClientHeaderLogos urls={clientLogoUrls} />
    ) : null;

  return (
    <CrmHeader
      roleLabel={roleLabel}
      fallbackName="User"
      profilePath={isCommandCenterUser ? "/dashboard/profile" : undefined}
      showSettings={!isClientViewer}
      search={<GlobalSearch />}
      trailingSlot={trailingSlot}
    />
  );
}
