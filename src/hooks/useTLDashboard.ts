"use client";

import { useQuery } from "@tanstack/react-query";

export type TLStats = {
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
  totalInterested: number;
  conversionPct: number;
  qualifiedLeads: number;
  qualifiedRatePct: number;
  leadTrend?: { date: string; leads: number; campaigns: number }[];
};

export type TLCampaignRow = {
  id: string;
  name: string;
  status: string;
  total_leads: number;
  total_agents: number;
  qualified_leads: number;
};

async function fetchTLStats(): Promise<TLStats> {
  const res = await fetch("/api/tl/campaigns/stats", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load stats");
  return data;
}

async function fetchTLCampaigns(): Promise<{ campaigns: TLCampaignRow[] }> {
  const res = await fetch("/api/tl/campaigns", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load campaigns");
  return data;
}

export function useTLDashboard(enabled: boolean) {
  const statsQuery = useQuery({
    queryKey: ["tl", "dashboard", "stats"],
    queryFn: fetchTLStats,
    enabled,
    staleTime: 60 * 1000,
  });

  const campaignsQuery = useQuery({
    queryKey: ["tl", "campaigns"],
    queryFn: fetchTLCampaigns,
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
