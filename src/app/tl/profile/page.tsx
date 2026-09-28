"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ProfilePage from "@/components/Profile/ProfilePage";
import { useAuth } from "@/context/AuthContext";
import { getTLAreaRoleDisplayName } from "@/lib/auth/tl-access";
import { Spin } from "antd";

export default function TLProfilePage() {
  const router = useRouter();
  const { hasTLAccess, isInitialized, roles } = useAuth();

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasTLAccess()) {
      router.replace("/login");
      return;
    }
  }, [isInitialized, hasTLAccess, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!hasTLAccess()) {
    return null;
  }

  const roleLabel = getTLAreaRoleDisplayName(roles);
  return <ProfilePage profilePath="/tl/profile" roleLabel={roleLabel} />;
}
