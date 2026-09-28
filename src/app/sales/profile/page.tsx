"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ProfilePage from "@/components/Profile/ProfilePage";
import { useAuth } from "@/context/AuthContext";
import { Spin } from "antd";

export default function SalesProfilePage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const hasSalesAccess =
    hasRole("sales") || hasRole("sales_manager") || hasRole("admin");

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasSalesAccess) {
      router.replace("/login");
      return;
    }
  }, [isInitialized, hasSalesAccess, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!hasSalesAccess) {
    return null;
  }

  return <ProfilePage profilePath="/sales/profile" roleLabel="Sales" />;
}
