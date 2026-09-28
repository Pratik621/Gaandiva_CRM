"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ProfilePage from "@/components/Profile/ProfilePage";
import { useAuth } from "@/context/AuthContext";
import { getSTLAreaRoleDisplayName } from "@/lib/auth/stl-access";
import { Spin } from "antd";

export default function STLProfilePage() {
  const router = useRouter();
  const { isInitialized, roles, hasRole } = useAuth();
  const hasSTLAccess = hasRole("stl") || hasRole("operations_manager") || hasRole("admin");

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasSTLAccess) {
      router.replace("/login");
      return;
    }
  }, [isInitialized, hasSTLAccess, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!hasSTLAccess) {
    return null;
  }

  const roleLabel = getSTLAreaRoleDisplayName(roles);
  return <ProfilePage profilePath="/stl/profile" roleLabel={roleLabel} />;
}
