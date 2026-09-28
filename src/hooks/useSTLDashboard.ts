"use client";

import { useQuery } from "@tanstack/react-query";

export type STLStats = {
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
  totalInterested: number;
  conversionPct: number;
  qualifiedLeads: number;
  qualifiedRatePct: number;
  leadTrend?: { date: string; leads: number; campaigns: number }[];
};

export type STLCampaignRow = {
  id: string;
  name: string;
  status: string;
  total_leads: number;
  total_agents: number;
  qualified_leads: number;
};

async function fetchSTLStats(): Promise<STLStats> {
  const res = await fetch("/api/stl/campaigns/stats", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load stats");
  return data;
}

async function fetchSTLCampaigns(): Promise<{ campaigns: STLCampaignRow[] }> {
  const res = await fetch("/api/stl/campaigns", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load campaigns");
  return data;
}

export function useSTLDashboard(enabled: boolean) {
  const statsQuery = useQuery({
    queryKey: ["stl", "dashboard", "stats"],
    queryFn: fetchSTLStats,
    enabled,
    staleTime: 60 * 1000,
  });

  const campaignsQuery = useQuery({
    queryKey: ["stl", "campaigns"],
    queryFn: fetchSTLCampaigns,
    enabled,
    staleTime: 60 * 1000,
  });

  return {
    stats: statsQuery,
    campaigns: campaignsQuery,
    isLoading: statsQuery.isLoading || campaignsQuery.isLoading,
    isFetching: statsQuery.isFetching || campaignsQuery.isFetching,
    error: statsQuery.error ?? campaignsQuery.error,
    refetch: () => {
      statsQuery.refetch();
      campaignsQuery.refetch();
    },
  };
}
