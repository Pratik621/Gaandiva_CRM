"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import SalesDashboard from "@/components/Sales/SalesDashboard";
import { useAuth } from "@/context/AuthContext";

export default function AdminSalesPage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasRole("admin")) {
      router.replace("/login");
    }
  }, [isInitialized, hasRole, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!hasRole("admin")) {
    return null;
  }

  return <SalesDashboard />;
}
