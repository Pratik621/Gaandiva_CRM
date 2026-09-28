"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ProfilePage from "@/components/Profile/ProfilePage";
import { useAuth } from "@/context/AuthContext";
import { Spin } from "antd";

export default function QAProfilePage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasRole("qa")) {
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

  if (!hasRole("qa")) {
    return null;
  }

  return <ProfilePage profilePath="/qa/profile" roleLabel="QA" />;
}
