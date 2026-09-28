"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuth } from "@/context/AuthContext";
import CheckDataPanel from "@/components/command/CheckDataPanel";

export default function TLCheckDataPage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const canView = hasRole("operations_manager");

  useEffect(() => {
    if (isInitialized && !canView) {
      router.replace("/tl/dashboard");
    }
  }, [isInitialized, canView, router]);

  if (!isInitialized || !canView) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return <CheckDataPanel />;
}
