"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import ProfilePage from "@/components/Profile/ProfilePage";
import { useAuth } from "@/context/AuthContext";
import { COMMAND_CENTER_ROLES } from "@/lib/auth/config";

function getCommandCenterRoleLabel(hasRole: (role: string) => boolean): string {
  if (hasRole("client_viewer")) return "Client Viewer";
  if (hasRole("internal_admin")) return "Internal Admin";
  if (hasRole("internal_operator")) return "Internal Operator";
  return "Command Center";
}

export default function DashboardProfilePage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const canView = COMMAND_CENTER_ROLES.some((role) => hasRole(role));

  useEffect(() => {
    if (!isInitialized) return;
    if (!canView) {
      router.replace("/login");
    }
  }, [isInitialized, canView, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!canView) {
    return null;
  }

  return (
    <ProfilePage
      profilePath="/dashboard/profile"
      roleLabel={getCommandCenterRoleLabel(hasRole)}
    />
  );
}
