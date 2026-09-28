"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type QaStats = {
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
  totalAudited: number;
  totalQualified: number;
  totalDisqualified: number;
  pendingAudit: number;
  conversionPct: number;
};

export type CampaignWithLeads = {
  id: string;
  name?: string;
  campaign_code?: string | null;
  status?: string | null;
  leads: {
    qa_status: string | null;
    status?: string | null;
    created_at?: string;
    qa_audited_at?: string | null;
    audit_date?: string | null;
  }[];
};

type QaDashboardSummary = {
  total_leads: number;
  total_audited: number;
  pending_audit: number;
  total_qualified: number;
  total_disqualified: number;
};

async function fetchQADashboard(): Promise<{
  campaigns: CampaignWithLeads[];
  summary?: QaDashboardSummary;
}> {
  const res = await fetch("/api/qa/dashboard", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
  return data;
}

function buildStats(
  campaigns: CampaignWithLeads[],
  summary?: QaDashboardSummary
): QaStats {
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "active").length;
  const totalLeads =
    summary?.total_leads ??
    campaigns.reduce((sum, campaign) => sum + (campaign.leads?.length ?? 0), 0);
  const totalAudited = summary?.total_audited ?? 0;
  const totalQualified = summary?.total_qualified ?? 0;
  const totalDisqualified = summary?.total_disqualified ?? 0;
  const pendingAudit = summary?.pending_audit ?? 0;

  return {
    totalCampaigns,
    activeCampaigns,
    totalLeads,
    totalAudited,
    totalQualified,
    totalDisqualified,
    pendingAudit,
    conversionPct: totalLeads > 0 ? Math.round((totalAudited / totalLeads) * 100) : 0,
  };
}

export function useQADashboard(enabled: boolean) {
  const dashboardQuery = useQuery({
    queryKey: ["qa", "dashboard"],
    queryFn: fetchQADashboard,
    enabled,
    staleTime: 60 * 1000,
  });

  const statsData = useMemo(
    () => buildStats(dashboardQuery.data?.campaigns ?? [], dashboardQuery.data?.summary),
    [dashboardQuery.data?.campaigns, dashboardQuery.data?.summary]
  );

  return {
    dashboard: dashboardQuery,
    stats: {
      data: statsData,
      isLoading: dashboardQuery.isLoading,
      isFetching: dashboardQuery.isFetching,
      isSuccess: dashboardQuery.isSuccess,
      isError: dashboardQuery.isError,
      error: dashboardQuery.error,
      refetch: dashboardQuery.refetch,
    },
    isLoading: dashboardQuery.isLoading,
    isFetching: dashboardQuery.isFetching,
    error: dashboardQuery.error,
    refetch: () => {
      dashboardQuery.refetch();
    },
  };
}
