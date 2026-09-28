"use client";

import { Spin } from "antd";
import SalesDashboard from "@/components/Sales/SalesDashboard";
import SalesManagerDashboard from "@/components/Sales/SalesManagerDashboard";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { useAuth } from "@/context/AuthContext";

export default function SalesDashboardPage() {
  const { status } = useRoleGuard(["sales", "sales_manager", "admin"]);
  const { roles } = useAuth();

  if (status === "loading" || status === "redirecting") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  const isManagerOrAdmin = roles.some((r) =>
    ["sales_manager", "admin"].includes(
      r.role_name.toLowerCase().replace(/\s+/g, "_")
    )
  );

  return isManagerOrAdmin ? <SalesManagerDashboard /> : <SalesDashboard />;
}
