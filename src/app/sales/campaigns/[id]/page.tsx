"use client";

import { Spin } from "antd";
import { useAuth } from "@/context/AuthContext";
import SalesManagerCampaignDetailView from "@/components/Sales/SalesManagerCampaignDetailView";
import SalesTeamCampaignDetailView from "@/components/Sales/SalesTeamCampaignDetailView";

/**
 * Plain "Sales" role gets the new QA-TL-style campaign detail + leads view
 * (new /api/sales/campaigns/[id] API). Sales Manager and admin keep the
 * existing campaign detail page (unchanged, still backed by /api/tl/campaigns).
 */
export default function SalesCampaignDetailPage() {
  const { hasRole, isInitialized } = useAuth();

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  const isPlainSales = hasRole("sales") && !hasRole("sales_manager") && !hasRole("admin");

  return isPlainSales ? <SalesTeamCampaignDetailView /> : <SalesManagerCampaignDetailView />;
}
