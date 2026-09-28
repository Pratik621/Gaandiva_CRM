"use client";

import { Spin } from "antd";
import SalesDashboard from "@/components/Sales/SalesDashboard";
import { useRoleGuard } from "@/hooks/useRoleGuard";

export default function SalesPage() {
  const { status } = useRoleGuard(["sales", "sales_manager", "admin"]);

  if (status === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (status === "redirecting") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return <SalesDashboard />;
}

