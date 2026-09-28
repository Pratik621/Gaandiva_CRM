"use client";

import { Spin } from "antd";
import { useAuth } from "@/context/AuthContext";
import SalesManagerCampaignsView from "@/components/Sales/SalesManagerCampaignsView";
import SalesTeamCampaignsView from "@/components/Sales/SalesTeamCampaignsView";

/**
 * Plain "Sales" role gets the new QA-TL-style campaigns+leads view (new
 * /api/sales/campaigns API). Sales Manager and admin keep the existing
 * campaign-CRUD list (unchanged, still backed by /api/tl/campaigns).
 */
export default function SalesCampaignsPage() {
  const { hasRole, isInitialized } = useAuth();

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  const isPlainSales = hasRole("sales") && !hasRole("sales_manager") && !hasRole("admin");

  return isPlainSales ? <SalesTeamCampaignsView /> : <SalesManagerCampaignsView />;
}
