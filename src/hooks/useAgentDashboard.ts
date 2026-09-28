"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  AgentCampaignLeadBar,
  AgentCompletionPrediction,
  AgentLeadTrendDay,
} from "@/lib/agent-dashboard-metrics";

export type AgentDashboardSummary = {
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
  activeLeads: number;
  pendingLeads: number;
  qualifiedLeads: number;
  disqualifiedLeads: number;
  qualifiedRatePct: number;
  billableLeads: number;
};

export type AgentDashboardCampaignRow = {
  id: string;
  campaign_id?: string | null;
  campaign_code?: string | null;
  name: string;
  client_name: string | null;
  industry: string | null;
  geography: string | null;
  lead_type: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  total_leads: number;
  active_leads: number;
  won_leads: number;
  qualified_leads?: number;
};

export type AgentDashboardResponse = {
  summary: AgentDashboardSummary;
  leadTrend: AgentLeadTrendDay[];
  campaignLeads: AgentCampaignLeadBar[];
  completionPredictions: AgentCompletionPrediction[];
  recentCampaigns: AgentDashboardCampaignRow[];
};

async function fetchAgentDashboard(): Promise<AgentDashboardResponse> {
  const res = await fetch("/api/agent/dashboard?limit=10", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
  return data;
}

async function fetchAgentCampaigns(): Promise<{ campaigns: AgentDashboardCampaignRow[] }> {
  const res = await fetch("/api/agent/campaigns", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load campaigns");
  return data;
}

export function useAgentDashboard(enabled: boolean) {
  const dashboardQuery = useQuery({
    queryKey: ["agent", "dashboard"],
    queryFn: fetchAgentDashboard,
    enabled,
    staleTime: 60 * 1000,
  });

  const campaignsQuery = useQuery({
    queryKey: ["agent", "campaigns"],
    queryFn: fetchAgentCampaigns,
    enabled,
    staleTime: 60 * 1000,
  });

  return {
    dashboard: dashboardQuery,
    campaigns: campaignsQuery,
    isLoading: dashboardQuery.isLoading || campaignsQuery.isLoading,
    isFetching: dashboardQuery.isFetching || campaignsQuery.isFetching,
    error: dashboardQuery.error ?? campaignsQuery.error,
    refetch: () => {
      dashboardQuery.refetch();
      campaignsQuery.refetch();
    },
  };
}
