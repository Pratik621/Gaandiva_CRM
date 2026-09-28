"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ProfilePage from "@/components/Profile/ProfilePage";
import { useAuth } from "@/context/AuthContext";
import { Spin } from "antd";

export default function MISTLProfilePage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasRole("mis_tl") && !hasRole("admin")) {
      router.replace("/login");
      return;
    }
  }, [isInitialized, hasRole, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!hasRole("mis_tl") && !hasRole("admin")) {
    return null;
  }

  return <ProfilePage profilePath="/mistl/profile" roleLabel="MIS TL" />;
}

