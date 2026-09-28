"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuth } from "@/context/AuthContext";

/** Legacy path — keep sales_manager / OM on their own layout sidebars. */
export default function CheckDataPage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();

  useEffect(() => {
    if (!isInitialized) return;

    if (hasRole("sales_manager")) {
      router.replace("/sales/check-data");
      return;
    }
    if (hasRole("operations_manager")) {
      router.replace("/tl/check-data");
      return;
    }

    router.replace("/login?reason=unauthorized");
  }, [hasRole, isInitialized, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Spin size="large" />
    </div>
  );
}
