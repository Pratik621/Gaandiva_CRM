"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import dayjs, { type Dayjs } from "dayjs";
import DashboardGreeting from "@/components/Dashboard/DashboardGreeting";
import { useQuery } from "@tanstack/react-query";
import { useCachedApiQuery } from "@/hooks/useCachedApiQuery";
import {
  useServerTablePagination,
  useSyncListPaginationTotal,
  serverTableInitialLoading,
} from "@/hooks/useServerTablePagination";
import type { ApiPaginationMeta } from "@/lib/api-pagination";
import { useAuth } from "@/context/AuthContext";
import {
  Card,
  Row,
  Col,
  Typography,
  Tag,
  Table,
  Button,
  Empty,
  Drawer,
  Space,
  Skeleton,
  DatePicker,
  Select,
  Collapse,
  Input,
} from "antd";
import {
  FundProjectionScreenOutlined,
  RiseOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  RightOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  StatCardsRowSkeleton,
  TableSkeleton,
  ChartSkeleton,
  ChartsRowSkeleton,
} from "@/components/Dashboard/DashboardSkeletons";

// Code-split the recharts-backed chart components so their JS doesn't ship in
// the initial dashboard bundle — they're rendered client-side only, after the
// KPI shell and data are already visible.
const TLLeadTrendChart = dynamic(
  () => import("@/components/Dashboard/TLDashboardCharts").then((m) => m.TLLeadTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const TLCampaignPerformanceChart = dynamic(
  () => import("@/components/Dashboard/TLDashboardCharts").then((m) => m.TLCampaignPerformanceChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const TLCampaignStatusPieChart = dynamic(
  () => import("@/components/Dashboard/TLDashboardCharts").then((m) => m.TLCampaignStatusPieChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
import type { ColumnsType } from "antd/es/table";
import type { AgentPerformance, TeamPerformanceResponse } from "@/app/api/tl/team-performance/route";
import type { DashboardSummaryResponse } from "@/app/api/tl/dashboard/summary/route";
import type { TLCampaignRow } from "@/hooks/useTLDashboard";
import type { AgentProfileResponse } from "@/app/api/tl/agents/[id]/profile/route";
import type { TeamLeaderProfileResponse } from "@/app/api/tl/team-leaders/[id]/profile/route";
import type { TLSummary } from "@/app/api/tl/team-performance/route";
import type { OmCampaignDetailResponse } from "@/app/api/tl/campaigns/[id]/om-detail/route";

type OmCampaignRow = TLCampaignRow & {
  campaign_type?: string | null;
  lead_type?: string | null;
  assigned_team_leader_name?: string | null;
  delivered_leads?: number;
};

const { Text } = Typography;

const CAMPAIGN_PAGE_SIZE = 15;

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
  transition: "all 0.3s ease",
};

const statusColors: Record<string, string> = {
  draft: "default",
  active: "green",
  paused: "orange",
  completed: "success",
};

function summaryCardHover(e: React.MouseEvent<HTMLDivElement>, enter: boolean) {
  const el = e.currentTarget;
  el.style.boxShadow = enter ? "0 4px 16px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.08)";
  el.style.transform = enter ? "translateY(-2px)" : "translateY(0)";
}

// Responsive pass on this page only — laptop/desktop keeps the original fixed
// layout; tablet gets reduced spacing, smaller table text, and charts collapsed
// behind a tap-to-expand panel. Phones are redirected before the page ever
// renders (see mobile-access-guard), so there's no separate mobile tier here.
function useIsCompactViewport(): boolean {
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const compute = () => setIsCompact(window.innerWidth <= 1024);
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return isCompact;
}

async function fetchCampaignOmDetail(
  campaignId: string,
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<OmCampaignDetailResponse> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    tz: timeZone,
  });
  const res = await fetch(`/api/tl/campaigns/${campaignId}/om-detail?${params.toString()}`, {
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load campaign detail");
  return json as OmCampaignDetailResponse;
}

async function fetchAgentProfile(
  agentId: string,
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<AgentProfileResponse> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    tz: timeZone,
  });
  const res = await fetch(`/api/tl/agents/${agentId}/profile?${params.toString()}`, {
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load agent profile");
  return json as AgentProfileResponse;
}

async function fetchTeamLeaderProfile(
  tlId: string,
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<TeamLeaderProfileResponse> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    tz: timeZone,
  });
  const res = await fetch(`/api/tl/team-leaders/${tlId}/profile?${params.toString()}`, {
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load team leader profile");
  return json as TeamLeaderProfileResponse;
}

export default function OperationsManagerDashboardPage() {
  const { hasTLAccess, isInitialized } = useAuth();
  const isCompact = useIsCompactViewport();
  const [isOffline, setIsOffline] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedTlId, setSelectedTlId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedCampaignTlId, setSelectedCampaignTlId] = useState<string | null>(null);
  const [selectedSummaryCard, setSelectedSummaryCard] = useState<
    "campaigns" | "leads" | "agents" | "avg" | null
  >(null);
  const [showLowestPerformers, setShowLowestPerformers] = useState(false);
  const [activeView, setActiveView] = useState<"campaign" | "team">("campaign");
  const [selectedDateRange, setSelectedDateRange] = useState<[Dayjs, Dayjs]>(() => {
    const end = dayjs();
    const start = end.startOf("month");
    return [start, end];
  });
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<string | null>(null);
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<string | null>(null);
  const [campaignSearchTerm, setCampaignSearchTerm] = useState("");
  const [campaignSearchDebounced, setCampaignSearchDebounced] = useState("");
  const [agentSearchTerm, setAgentSearchTerm] = useState("");
  const [agentSearchDebounced, setAgentSearchDebounced] = useState("");
  const [tlSearchTerm, setTlSearchTerm] = useState("");
  const [tlSearchDebounced, setTlSearchDebounced] = useState("");

  const {
    page: campaignPage,
    pageSize: campaignPageSize,
    resetPage: resetCampaignPage,
    applyPaginationMeta: applyCampaignPaginationMeta,
    tablePagination: campaignTablePaginationBase,
  } = useServerTablePagination(CAMPAIGN_PAGE_SIZE);

  const campaignTablePagination = useMemo(
    () => ({
      ...campaignTablePaginationBase,
      pageSize: CAMPAIGN_PAGE_SIZE,
      showSizeChanger: false,
    }),
    [campaignTablePaginationBase]
  );

  const enabled = Boolean(isInitialized && hasTLAccess());

  useEffect(() => {
    const handle = setTimeout(() => setCampaignSearchDebounced(campaignSearchTerm.trim()), 350);
    return () => clearTimeout(handle);
  }, [campaignSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => setAgentSearchDebounced(agentSearchTerm.trim()), 350);
    return () => clearTimeout(handle);
  }, [agentSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => setTlSearchDebounced(tlSearchTerm.trim()), 350);
    return () => clearTimeout(handle);
  }, [tlSearchTerm]);

  useEffect(() => {
    resetCampaignPage();
  }, [campaignSearchDebounced, campaignStatusFilter, campaignTypeFilter, resetCampaignPage]);

  const timeZone = useMemo(() => {
    if (typeof Intl === "undefined") return "UTC";
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }, []);

  // Keep KPI data in sync with the selected date range, just like the
  // performance charts and detail drawers.
  const summaryApiUrl = useMemo(() => {
    const start = selectedDateRange[0].format("YYYY-MM-DD");
    const end = selectedDateRange[1].format("YYYY-MM-DD");
    const params = new URLSearchParams({ start_date: start, end_date: end, tz: timeZone });
    return `/api/tl/dashboard/summary?${params.toString()}`;
  }, [selectedDateRange, timeZone]);

  const summaryQuery = useCachedApiQuery<DashboardSummaryResponse>(
    ["tl", "dashboard", "summary", summaryApiUrl],
    summaryApiUrl,
    { enabled, refetchInterval: 90_000 }
  );

  const performanceApiUrl = useMemo(() => {
    const start = selectedDateRange[0].format("YYYY-MM-DD");
    const end = selectedDateRange[1].format("YYYY-MM-DD");
    const params = new URLSearchParams({ start_date: start, end_date: end, tz: timeZone });
    return `/api/tl/team-performance?${params.toString()}`;
  }, [selectedDateRange, timeZone]);

  const performanceQuery = useCachedApiQuery<TeamPerformanceResponse>(
    ["tl", "team-performance", performanceApiUrl],
    performanceApiUrl,
    {
      enabled: enabled && (activeView === "campaign" || activeView === "team"),
      refetchInterval: 90_000,
    }
  );

  const campaignsApiUrl = useMemo(() => {
    const params = new URLSearchParams({
      page: String(campaignPage),
      limit: String(campaignPageSize),
      sort: "active_first",
      skip_filter_options: "1",
    });
    if (campaignSearchDebounced) {
      params.set("q", campaignSearchDebounced);
    } else {
      if (campaignStatusFilter) params.set("status", campaignStatusFilter);
      if (campaignTypeFilter) params.set("type", campaignTypeFilter);
    }
    return `/api/tl/campaigns?${params.toString()}`;
  }, [
    campaignPage,
    campaignPageSize,
    campaignStatusFilter,
    campaignTypeFilter,
    campaignSearchDebounced,
  ]);

  const campaignsQuery = useCachedApiQuery<{
    campaigns: OmCampaignRow[];
    pagination: ApiPaginationMeta;
  }>(["tl", "campaigns", "dashboard", campaignsApiUrl], campaignsApiUrl, {
    enabled: enabled && activeView === "campaign",
  });

  useSyncListPaginationTotal(campaignsQuery.data?.pagination, applyCampaignPaginationMeta);

  const campaignDetailApiParams = useMemo(() => {
    if (!selectedCampaignId) return null;
    return {
      campaignId: selectedCampaignId,
      startDate: selectedDateRange[0].format("YYYY-MM-DD"),
      endDate: selectedDateRange[1].format("YYYY-MM-DD"),
      timeZone,
    };
  }, [selectedCampaignId, selectedDateRange, timeZone]);

  const selectedCampaignDetailQuery = useQuery({
    queryKey: ["om", "campaign-detail", campaignDetailApiParams],
    queryFn: () =>
      fetchCampaignOmDetail(
        campaignDetailApiParams!.campaignId,
        campaignDetailApiParams!.startDate,
        campaignDetailApiParams!.endDate,
        campaignDetailApiParams!.timeZone
      ),
    enabled: Boolean(campaignDetailApiParams),
    staleTime: 60_000,
  });

  useEffect(() => {
    setSelectedCampaignTlId(null);
  }, [selectedCampaignId]);

  const selectedCampaignTlOptions = useMemo(() => {
    const agents = selectedCampaignDetailQuery.data?.agents ?? [];
    const map = new Map<string, string | null>();
    for (const agent of agents) {
      if (!agent.tl_id) continue;
      map.set(agent.tl_id, agent.tl_name ?? "Unknown TL");
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [selectedCampaignDetailQuery.data]);

  const filteredCampaignAgents = useMemo(() => {
    const agents = selectedCampaignDetailQuery.data?.agents ?? [];
    if (!selectedCampaignTlId) return agents;
    return agents.filter((agent) => agent.tl_id === selectedCampaignTlId);
  }, [selectedCampaignDetailQuery.data, selectedCampaignTlId]);

  const agentProfileApiParams = useMemo(() => {
    if (!selectedAgentId) return null;
    return {
      agentId: selectedAgentId,
      startDate: selectedDateRange[0].format("YYYY-MM-DD"),
      endDate: selectedDateRange[1].format("YYYY-MM-DD"),
      timeZone,
    };
  }, [selectedAgentId, selectedDateRange, timeZone]);

  const agentProfileQuery = useQuery({
    queryKey: ["tl", "agent-profile", agentProfileApiParams],
    queryFn: () =>
      fetchAgentProfile(
        agentProfileApiParams!.agentId,
        agentProfileApiParams!.startDate,
        agentProfileApiParams!.endDate,
        agentProfileApiParams!.timeZone
      ),
    enabled: Boolean(agentProfileApiParams),
    staleTime: 60_000,
  });

  const tlProfileApiParams = useMemo(() => {
    if (!selectedTlId) return null;
    return {
      tlId: selectedTlId,
      startDate: selectedDateRange[0].format("YYYY-MM-DD"),
      endDate: selectedDateRange[1].format("YYYY-MM-DD"),
      timeZone,
    };
  }, [selectedTlId, selectedDateRange, timeZone]);

  const tlProfileQuery = useQuery({
    queryKey: ["tl", "team-leader-profile", tlProfileApiParams],
    queryFn: () =>
      fetchTeamLeaderProfile(
        tlProfileApiParams!.tlId,
        tlProfileApiParams!.startDate,
        tlProfileApiParams!.endDate,
        tlProfileApiParams!.timeZone
      ),
    enabled: Boolean(tlProfileApiParams),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      setIsOffline(false);
      summaryQuery.refetch();
      performanceQuery.refetch();
      campaignsQuery.refetch();
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [summaryQuery, performanceQuery, campaignsQuery]);

  const summary = summaryQuery.data;
  const performance = performanceQuery.data;
  const campaignRows = useMemo(() => campaignsQuery.data?.campaigns ?? [], [campaignsQuery.data]);

  const campaignTypeOptions = useMemo(() => {
    const defaultTypes = ["Webinar", "HQL", "BANT", "CDQA", "Whitepaper"];
    const types = new Set<string>(defaultTypes);
    campaignRows.forEach((campaign) => {
      if (campaign.campaign_type) types.add(campaign.campaign_type);
      if (campaign.lead_type) types.add(campaign.lead_type);
    });

    const dynamicTypes = [...types].filter((type) => !defaultTypes.includes(type)).sort();
    return [
      { value: "", label: "All types" },
      ...defaultTypes.map((type) => ({ value: type, label: type })),
      ...dynamicTypes.map((type) => ({ value: type, label: type })),
    ];
  }, [campaignRows]);

  const campaignStatusOptions = useMemo(
    () => [
      { value: "", label: "All statuses" },
      { value: "active", label: "Active" },
      { value: "paused", label: "Paused" },
      { value: "completed", label: "Completed" },
      { value: "draft", label: "Draft" },
    ],
    []
  );

  const displayedAgents = useMemo(() => {
    if (!performance?.agents?.length) return [];
    const sorted = [...performance.agents].sort((a, b) => b.total_leads - a.total_leads);
    const searchTerm = agentSearchDebounced.toLowerCase();

    if (searchTerm) {
      return sorted.filter((agent) => {
        const haystack = [
          agent.agent_name,
          agent.agent_code ?? "",
          agent.tl_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchTerm);
      });
    }

    if (showLowestPerformers) {
      return [...sorted].reverse().slice(0, 6);
    }
    return sorted.slice(0, 6);
  }, [performance?.agents, showLowestPerformers, agentSearchDebounced]);

  const statsCards = useMemo(() => {
    const s = summary ?? {
      campaigns: { total: 0, active: 0, paused: 0, draft: 0, completed: 0, ending_today: 0, ending_this_week: 0 },
      leads: { total: 0, today: 0, qualified: 0, disqualified: 0, qualification_rate_pct: 0, today_conversion_rate_pct: 0 },
      people: { total_team_leaders: 0, total_agents: 0, active_agents: 0, inactive_agents: 0, avg_leads_per_agent: 0, avg_leads_per_team: 0 },
      scope: "team",
    };

    return [
      {
        key: "campaigns",
        title: "Total Campaigns",
        value: s.campaigns.total.toLocaleString(),
        subtitle: `${s.campaigns.active} active`,
        icon: <FundProjectionScreenOutlined />,
        color: "#4f46e5",
        bgColor: "#eef2ff",
      },
      {
        key: "leads",
        title: "Total Leads",
        value: s.leads.total.toLocaleString(),
        subtitle: `${s.leads.today} today`,
        icon: <TeamOutlined />,
        color: "#722ed1",
        bgColor: "#f9f0ff",
      },
      {
        key: "agents",
        title: "Active Agents",
        value: s.people.active_agents.toLocaleString(),
        subtitle: `${s.people.inactive_agents} inactive`,
        icon: <RiseOutlined />,
        color: "#52c41a",
        bgColor: "#f6ffed",
      },
      {
        key: "avg",
        title: "Avg leads / agent",
        value: s.people.avg_leads_per_agent.toString(),
        subtitle: `${s.people.total_team_leaders} team leaders`,
        icon: <CheckCircleOutlined />,
        color: "#f59e0b",
        bgColor: "#fff7e6",
      },
    ];
  }, [summary]);

  const leadTrendData = useMemo(() => {
    return (performance?.daily_trend ?? []).map((point) => ({
      date: dayjs(point.date).format("DD MMM"),
      leads: point.leads,
      campaigns: 0,
    }));
  }, [performance]);

  const campaignPerformanceData = useMemo(() => {
    return (performance?.campaigns ?? [])
      .slice(0, 5)
      .map((c) => ({
        name: c.campaign_name.length > 18 ? `${c.campaign_name.slice(0, 17)}…` : c.campaign_name,
        leads: c.total_uploaded,
        qualified: c.qualified_leads,
      }));
  }, [performance]);

  const campaignStatusPie = useMemo(() => {
    const counts = summary?.campaigns;
    if (!counts) return [];
    return [
      { name: "Active", value: counts.active, color: "#52c41a" },
      { name: "Paused", value: counts.paused, color: "#f59e0b" },
      { name: "Draft", value: counts.draft, color: "#6b7280" },
      { name: "Completed", value: counts.completed, color: "#4f46e5" },
    ].filter((entry) => entry.value > 0);
  }, [summary]);

  const agentColumns: ColumnsType<AgentPerformance> = useMemo(
    () => [
      {
        title: "#",
        key: "rank",
        width: 60,
        render: (_value, _record, index) => index + 1,
      },
      {
        title: "Agent",
        dataIndex: "agent_name",
        key: "agent_name",
        render: (name, record) => (
          <div>
            <Text strong>{name}</Text>
            <div style={{ color: "#6b7280", fontSize: 12 }}>
              {record.agent_code ? `Code ${record.agent_code}` : "Team agent"}
            </div>
          </div>
        ),
      },
      {
        title: "Leads",
        dataIndex: "total_leads",
        key: "total_leads",
        width: 90,
      },
      {
        title: "Today",
        dataIndex: "today_leads",
        key: "today_leads",
        width: 90,
      },
      {
        title: "Avg/day",
        dataIndex: "avg_per_day",
        key: "avg_per_day",
        width: 90,
      },
      {
        title: "",
        key: "action",
        width: 100,
        render: (_value, record) => (
          <Button type="link" onClick={() => setSelectedAgentId(record.agent_id)}>
            View
          </Button>
        ),
      },
    ],
    []
  );

  const recentCampaignColumns = useMemo(
    () => [
      {
        title: "Sr. No",
        key: "srno",
        width: 70,
        render: (_: unknown, __: unknown, index: number) => index + 1,
      },
      {
        title: "Campaign",
        key: "name",
        render: (_: unknown, record: OmCampaignRow) => (
          <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>
            {record.name}
          </div>
        ),
      },
      {
        title: "Team Leader",
        dataIndex: "assigned_team_leader_name",
        key: "assigned_team_leader_name",
        render: (name: string | null) => name ?? <Text type="secondary">Unassigned</Text>,
      },
      {
        title: "Lead type",
        dataIndex: "lead_type",
        key: "lead_type",
        width: 140,
        render: (lead_type: string | null) => lead_type ?? <Text type="secondary">Unknown</Text>,
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (status: string) => (
          <Tag color={statusColors[status] ?? "default"} style={{ textTransform: "capitalize" }}>
            {status}
          </Tag>
        ),
      },
      { title: "Leads", dataIndex: "total_leads", key: "total_leads", width: 90 },
      { title: "Agents", dataIndex: "total_agents", key: "total_agents", width: 90 },
      {
        title: "",
        key: "action",
        width: 120,
        render: (_: unknown, record: OmCampaignRow) => (
          <Button type="link" icon={<RightOutlined />} onClick={() => setSelectedCampaignId(record.id)}>
            View details
          </Button>
        ),
      },
    ],
    []
  );

  const drawerTitle = agentProfileQuery.data?.agent.full_name ?? "Agent details";
  const drawerLoading = agentProfileQuery.isLoading;
  const agentProfile = agentProfileQuery.data;
  const agentCampaignRows = agentProfile?.campaigns ?? [];

  const agentCampaignColumns: ColumnsType<(typeof agentCampaignRows)[number]> = useMemo(
    () => [
      {
        title: "Campaign",
        key: "campaign_name",
        render: (_value, record) => (
          <div>
            <Text strong>{record.campaign_name}</Text>
            {record.campaign_code ? (
              <div style={{ color: "#6b7280", fontSize: 12 }}>{record.campaign_code}</div>
            ) : null}
          </div>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        width: 110,
        render: (status: string) => (
          <Tag color={statusColors[status] ?? "default"} style={{ textTransform: "capitalize" }}>
            {status}
          </Tag>
        ),
      },
      { title: "Leads", dataIndex: "total_leads", key: "total_leads", width: 90, align: "center" },
      {
        title: "Qualified",
        dataIndex: "qualified_leads",
        key: "qualified_leads",
        width: 100,
        align: "center",
      },
      {
        title: "Disqualified",
        dataIndex: "disqualified_leads",
        key: "disqualified_leads",
        width: 110,
        align: "center",
      },
      {
        title: "Delivered",
        dataIndex: "delivered_leads",
        key: "delivered_leads",
        width: 100,
        align: "center",
      },
    ],
    []
  );

  const tlRows = useMemo(() => {
    const rows = performance?.tl_summaries ?? [];
    const searchTerm = tlSearchDebounced.toLowerCase();
    if (!searchTerm) return rows;
    return rows.filter((tl) => (tl.tl_name ?? "").toLowerCase().includes(searchTerm));
  }, [performance?.tl_summaries, tlSearchDebounced]);

  const tlColumns: ColumnsType<TLSummary> = useMemo(
    () => [
      {
        title: "#",
        key: "rank",
        width: 60,
        render: (_: unknown, _record: unknown, index: number) => index + 1,
      },
      {
        title: "Team Leader",
        key: "tl_name",
        render: (_: unknown, record: TLSummary) => (
          <Text strong>{record.tl_name ?? "Unknown TL"}</Text>
        ),
      },
      {
        title: "Agents",
        dataIndex: "agent_count",
        key: "agent_count",
        width: 90,
        align: "center",
      },
      {
        title: "Campaigns",
        dataIndex: "campaign_count",
        key: "campaign_count",
        width: 110,
        align: "center",
      },
      {
        title: "Total leads",
        dataIndex: "total_leads",
        key: "total_leads",
        width: 110,
        align: "center",
      },
      {
        title: "Qualified",
        dataIndex: "qualified_leads",
        key: "qualified_leads",
        width: 100,
        align: "center",
      },
      {
        title: "Disqualified",
        dataIndex: "disqualified_leads",
        key: "disqualified_leads",
        width: 110,
        align: "center",
      },
      {
        title: "Delivered",
        dataIndex: "delivered_leads",
        key: "delivered_leads",
        width: 100,
        align: "center",
      },
      {
        title: "",
        key: "action",
        width: 90,
        render: (_: unknown, record: TLSummary) => (
          <Button type="link" onClick={() => setSelectedTlId(record.tl_id)}>
            View
          </Button>
        ),
      },
    ],
    []
  );

  const closeDrawer = useCallback(() => setSelectedAgentId(null), []);
  const closeTlDrawer = useCallback(() => setSelectedTlId(null), []);
  const closeCampaignDrawer = useCallback(() => setSelectedCampaignId(null), []);
  const closeSummaryDrawer = useCallback(() => setSelectedSummaryCard(null), []);

  const tlProfile = tlProfileQuery.data;
  const tlCampaignRows = tlProfile?.campaigns ?? [];
  const tlDrawerLoading = tlProfileQuery.isLoading;

  const tlCampaignColumns: ColumnsType<(typeof tlCampaignRows)[number]> = useMemo(
    () => [
      {
        title: "Campaign",
        key: "campaign_name",
        render: (_value, record) => (
          <div>
            <Text strong>{record.campaign_name}</Text>
            {record.campaign_code ? (
              <div style={{ color: "#6b7280", fontSize: 12 }}>{record.campaign_code}</div>
            ) : null}
          </div>
        ),
      },
      {
        title: "Agents",
        dataIndex: "agents_count",
        key: "agents_count",
        width: 90,
        align: "center",
      },
      {
        title: "Total leads",
        dataIndex: "total_leads",
        key: "total_leads",
        width: 110,
        align: "center",
      },
      {
        title: "Qualified",
        dataIndex: "qualified_leads",
        key: "qualified_leads",
        width: 100,
        align: "center",
      },
      {
        title: "Disqualified",
        dataIndex: "disqualified_leads",
        key: "disqualified_leads",
        width: 110,
        align: "center",
      },
      {
        title: "Delivered",
        dataIndex: "delivered_leads",
        key: "delivered_leads",
        width: 100,
        align: "center",
      },
    ],
    []
  );

  const selectedCampaignDetail = selectedCampaignDetailQuery.data;
  const selectedCampaign = selectedCampaignDetail?.campaign ?? null;
  const selectedCampaignDisqualified = selectedCampaign?.disqualified_leads ?? 0;
  const selectedCampaignMisDelivered = selectedCampaign?.delivered_leads ?? 0;

  const summaryDrawerTitle = useMemo(() => {
    switch (selectedSummaryCard) {
      case "campaigns":
        return "Campaign summary";
      case "leads":
        return "Lead summary";
      case "agents":
        return "People summary";
      case "avg":
        return "Lead efficiency";
      default:
        return "Summary details";
    }
  }, [selectedSummaryCard]);

  if (!isInitialized || !hasTLAccess()) {
    return null;
  }

  const summaryReady = Boolean(summary);
  const performanceReady = Boolean(performance);
  const campaignsReady = !serverTableInitialLoading(campaignsQuery.isLoading, campaignRows.length);

  return (
    <div className="om-dashboard-page" style={{ padding: "0 4px", maxWidth: 1600, margin: "0 auto" }}>
      <style>{`
        @media (max-width: 1024px) {
          .om-dashboard-page .ant-row,
          .om-dashboard-drawer .ant-row { margin-bottom: 12px !important; }
          .om-dashboard-page .ant-card,
          .om-dashboard-drawer .ant-card { margin-bottom: 10px; }
          .om-dashboard-page .ant-card-body,
          .om-dashboard-drawer .ant-card-body { padding: 12px !important; }
          .om-dashboard-page .ant-card-head,
          .om-dashboard-drawer .ant-card-head { padding: 0 12px !important; min-height: 40px !important; }
          .om-dashboard-page .ant-card-head-title,
          .om-dashboard-drawer .ant-card-head-title { font-size: 14px !important; padding: 10px 0 !important; }
          .om-dashboard-page .ant-table,
          .om-dashboard-drawer .ant-table { font-size: 12px; }
          .om-dashboard-page .ant-table-thead > tr > th,
          .om-dashboard-page .ant-table-tbody > tr > td,
          .om-dashboard-drawer .ant-table-thead > tr > th,
          .om-dashboard-drawer .ant-table-tbody > tr > td {
            padding: 6px 8px !important;
            white-space: nowrap;
          }
          .om-dashboard-page .ant-collapse-header { padding: 10px 12px !important; }
          .om-dashboard-page .ant-collapse-content-box { padding: 12px !important; }
          .om-dashboard-drawer .ant-drawer-header { padding: 12px 16px !important; }
        }
      `}</style>
      <div style={{ marginBottom: isCompact ? 16 : 24 }}>
        <DashboardGreeting />
      </div>

      <Row
        gutter={isCompact ? [10, 10] : [20, 20]}
        style={{ marginBottom: isCompact ? 12 : 24, alignItems: "center" }}
        wrap={isCompact}
      >
        <Col flex="none">
          <DatePicker.RangePicker
            value={selectedDateRange}
            onChange={(range) => {
              if (!range || range.length !== 2 || !range[0] || !range[1]) return;
              setSelectedDateRange([range[0], range[1]] as [Dayjs, Dayjs]);
            }}
            allowClear={false}
            format="DD MMM YYYY"
            style={{ width: isCompact ? 240 : 280 }}
            size={isCompact ? "small" : "middle"}
          />
        </Col>
        <Col flex="auto" style={{ display: "flex", justifyContent: "flex-end" }}>
          <Space size={isCompact ? 6 : 10} wrap>
            <Button
              size={isCompact ? "small" : "middle"}
              onClick={() => setActiveView("campaign")}
              style={{
                borderRadius: 8,
                fontWeight: 600,
                fontSize: isCompact ? 12 : 14,
                border: activeView === "campaign" ? "none" : "1px solid #e5e7eb",
                backgroundColor: activeView === "campaign" ? "#4f46e5" : "#fff",
                color: activeView === "campaign" ? "#fff" : "#374151",
              }}
            >
              Campaign Performance
            </Button>
            <Button
              size={isCompact ? "small" : "middle"}
              onClick={() => setActiveView("team")}
              style={{
                borderRadius: 8,
                fontWeight: 600,
                fontSize: isCompact ? 12 : 14,
                border: activeView === "team" ? "none" : "1px solid #e5e7eb",
                backgroundColor: activeView === "team" ? "#52c41a" : "#fff",
                color: activeView === "team" ? "#fff" : "#374151",
              }}
            >
              Team Performance
            </Button>
          </Space>
        </Col>
      </Row>

      {isOffline && (
        <div style={{ marginBottom: 24 }}>
          <Text type="danger" style={{ fontSize: 14 }}>
            You appear to be offline. Data will reload when back online, or{" "}
            <a onClick={(e) => { e.preventDefault(); summaryQuery.refetch(); performanceQuery.refetch(); campaignsQuery.refetch(); }}>
              retry now
            </a>
            .
          </Text>
        </div>
      )}

      {!summaryReady ? (
        <StatCardsRowSkeleton />
      ) : (
        <Row gutter={isCompact ? [10, 10] : [20, 20]} style={{ marginBottom: isCompact ? 12 : 24 }}>
          {statsCards.map((stat, index) => (
            <Col xs={24} sm={12} xl={6} key={index}>
              <Card
                bordered={false}
                style={{
                  ...cardStyle,
                  height: "100%",
                  cursor: "pointer",
                }}
                styles={{ body: { padding: isCompact ? 16 : 24 } }}
                onMouseEnter={(e) => summaryCardHover(e, true)}
                onMouseLeave={(e) => summaryCardHover(e, false)}
                onClick={() => setSelectedSummaryCard(stat.key as typeof selectedSummaryCard)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      type="secondary"
                      style={{
                        fontSize: isCompact ? 12 : 13,
                        display: "block",
                        marginBottom: isCompact ? 6 : 8,
                      }}
                    >
                      {stat.title}
                    </Text>
                    <div
                      style={{
                        fontSize: isCompact ? 24 : 32,
                        fontWeight: 700,
                        color: "#1f1f1f",
                        lineHeight: 1,
                        marginBottom: isCompact ? 6 : 10,
                      }}
                    >
                      {stat.value}
                    </div>
                    <Text type="secondary" style={{ fontSize: isCompact ? 11 : 12 }}>
                      {stat.subtitle}
                    </Text>
                  </div>
                  <div
                    style={{
                      width: isCompact ? 40 : 48,
                      height: isCompact ? 40 : 48,
                      borderRadius: 12,
                      backgroundColor: stat.bgColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: isCompact ? 18 : 22,
                      color: stat.color,
                      flexShrink: 0,
                    }}
                  >
                    {stat.icon}
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {activeView === "campaign" ? (
        <>
          {(() => {
            const chartsBody = !performanceReady ? (
              <Row gutter={isCompact ? [10, 10] : [20, 20]} style={{ marginBottom: isCompact ? 0 : 24 }}>
                {[0, 1, 2].map((index) => (
                  <Col xs={24} lg={8} key={index}>
                    <Card bordered={false} style={cardStyle}>
                      <Skeleton active paragraph={{ rows: 6 }} />
                    </Card>
                  </Col>
                ))}
              </Row>
            ) : (
              <Row gutter={isCompact ? [10, 10] : [20, 20]} style={{ marginBottom: isCompact ? 0 : 24 }}>
                <Col xs={24} lg={8}>
                  <TLLeadTrendChart data={leadTrendData} />
                </Col>
                <Col xs={24} lg={8}>
                  <TLCampaignPerformanceChart data={campaignPerformanceData} />
                </Col>
                <Col xs={24} lg={8}>
                  <TLCampaignStatusPieChart data={campaignStatusPie} />
                </Col>
              </Row>
            );

            if (!isCompact) return chartsBody;

            return (
              <Collapse
                bordered={false}
                style={{ marginBottom: 12, borderRadius: 12, background: "#fff" }}
                items={[
                  {
                    key: "charts",
                    label: (
                      <Text strong style={{ fontSize: 13 }}>
                        Performance charts (tap to view)
                      </Text>
                    ),
                    children: chartsBody,
                  },
                ]}
              />
            );
          })()}

          <Row gutter={isCompact ? [10, 10] : [20, 20]} style={{ marginBottom: isCompact ? 12 : 24 }}>
            <Col xs={24}>
              <Card
                title={
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <Text strong style={{ fontSize: isCompact ? 14 : 16 }}>
                      Campaigns
                    </Text>
                    {(campaignsQuery.data?.pagination?.total ?? campaignRows.length) > 0 ? (
                      <Link href="/tl/campaigns">View all</Link>
                    ) : null}
                  </div>
                }
                bordered={false}
                style={{
                  ...cardStyle,
                  borderTop: "4px solid #4f46e5",
                }}
                styles={{ body: { padding: isCompact ? 12 : 24 } }}
              >
                <Row gutter={[10, 10]} style={{ marginBottom: isCompact ? 12 : 16 }}>
                  <Col xs={24} md={10} lg={8}>
                    <Input.Search
                      value={campaignSearchTerm}
                      onChange={(e) => setCampaignSearchTerm(e.target.value)}
                      allowClear
                      placeholder="Search all campaigns…"
                      style={{ width: "100%" }}
                      size={isCompact ? "small" : "middle"}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={7} lg={8}>
                    <Select
                      value={campaignTypeFilter || ""}
                      onChange={(value) => setCampaignTypeFilter(value || null)}
                      allowClear
                      showSearch
                      disabled={Boolean(campaignSearchTerm.trim())}
                      placeholder="Filter by campaign or lead type"
                      options={campaignTypeOptions}
                      style={{ width: "100%" }}
                      dropdownMatchSelectWidth={false}
                      size={isCompact ? "small" : "middle"}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={7} lg={8}>
                    <Select
                      value={campaignStatusFilter || ""}
                      onChange={(value) => setCampaignStatusFilter(value || null)}
                      allowClear
                      disabled={Boolean(campaignSearchTerm.trim())}
                      options={campaignStatusOptions}
                      style={{ width: "100%" }}
                      dropdownMatchSelectWidth={false}
                      size={isCompact ? "small" : "middle"}
                    />
                  </Col>
                </Row>
                <div>
                  {!campaignsReady ? (
                    <TableSkeleton rows={5} />
                  ) : campaignRows.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No campaigns available" />
                  ) : (
                    <Table
                      dataSource={campaignRows}
                      rowKey="id"
                      pagination={campaignTablePagination}
                      loading={campaignsQuery.isFetching && campaignRows.length > 0}
                      size={isCompact ? "small" : "middle"}
                      columns={recentCampaignColumns}
                      scroll={isCompact ? { x: 760 } : undefined}
                      onRow={(record) => ({
                        onClick: () => setSelectedCampaignId(record.id),
                        style: { cursor: "pointer" },
                      })}
                    />
                  )}
                </div>
              </Card>
            </Col>
          </Row>
        </>
      ) : (
        <>
          <Row gutter={isCompact ? [10, 10] : [20, 20]} style={{ marginBottom: isCompact ? 12 : 24 }}>
            <Col xs={24}>
              <Card
                title={
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <Text strong style={{ fontSize: isCompact ? 14 : 16 }}>
                      {showLowestPerformers ? "Lowest performers" : "Top agents"}
                    </Text>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                        marginLeft: "auto",
                      }}
                    >
                      <Input.Search
                        value={agentSearchTerm}
                        onChange={(e) => setAgentSearchTerm(e.target.value)}
                        allowClear
                        placeholder="Search agents…"
                        style={{ width: isCompact ? 200 : 260 }}
                        size={isCompact ? "small" : "middle"}
                      />
                      <Button
                        type="default"
                        size={isCompact ? "small" : "middle"}
                        onClick={() => setShowLowestPerformers((current) => !current)}
                        disabled={Boolean(agentSearchDebounced)}
                      >
                        {showLowestPerformers ? "Show top" : "Show lowest"}
                      </Button>
                    </div>
                  </div>
                }
                bordered={false}
                style={{ ...cardStyle, borderTop: "4px solid #722ed1" }}
                styles={{ body: { padding: isCompact ? 12 : 24 } }}
              >
                {!performanceReady ? (
                  <Skeleton active paragraph={{ rows: 5 }} />
                ) : displayedAgents.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      agentSearchDebounced
                        ? "No agents match your search"
                        : "No active agents yet"
                    }
                  />
                ) : (
                  <Table
                    dataSource={displayedAgents}
                    rowKey="agent_id"
                    pagination={agentSearchDebounced ? { pageSize: 10, showSizeChanger: false } : false}
                    size={isCompact ? "small" : "middle"}
                    columns={agentColumns}
                    scroll={isCompact ? { x: 560 } : undefined}
                  />
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={isCompact ? [10, 10] : [20, 20]} style={{ marginBottom: isCompact ? 12 : 24 }}>
            <Col xs={24}>
              <Card
                title={
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <Text strong style={{ fontSize: isCompact ? 14 : 16 }}>
                      Team Leaders
                    </Text>
                    <Input.Search
                      value={tlSearchTerm}
                      onChange={(e) => setTlSearchTerm(e.target.value)}
                      allowClear
                      placeholder="Search team leaders…"
                      style={{ width: isCompact ? 200 : 260, marginLeft: "auto" }}
                      size={isCompact ? "small" : "middle"}
                    />
                  </div>
                }
                bordered={false}
                style={{ ...cardStyle, borderTop: "4px solid #52c41a" }}
                styles={{ body: { padding: isCompact ? 12 : 24 } }}
              >
                {!performanceReady ? (
                  <Skeleton active paragraph={{ rows: 6 }} />
                ) : tlRows.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      tlSearchDebounced
                        ? "No team leaders match your search"
                        : "No team leaders found"
                    }
                  />
                ) : (
                  <Table
                    dataSource={tlRows}
                    rowKey="tl_id"
                    pagination={tlSearchDebounced ? { pageSize: 10, showSizeChanger: false } : false}
                    size={isCompact ? "small" : "middle"}
                    columns={tlColumns}
                    scroll={isCompact ? { x: 900 } : undefined}
                  />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      <Drawer
        title={summaryDrawerTitle}
        width={isCompact ? "85%" : 560}
        onClose={closeSummaryDrawer}
        open={Boolean(selectedSummaryCard)}
        bodyStyle={{ padding: isCompact ? 14 : 24 }}
        rootClassName="om-dashboard-drawer"
      >
        {summary ? (
          <>
            {selectedSummaryCard === "campaigns" && (
              <>
                <Text type="secondary">Campaign lifecycle and availability for the selected range.</Text>
                <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
                  {[
                    { label: "Total campaigns", value: summary.campaigns.total },
                    { label: "Active campaigns", value: summary.campaigns.active },
                    { label: "Paused campaigns", value: summary.campaigns.paused },
                    { label: "Draft campaigns", value: summary.campaigns.draft },
                    { label: "Completed campaigns", value: summary.campaigns.completed },
                    { label: "Ending today", value: summary.campaigns.ending_today },
                    { label: "Ending this week", value: summary.campaigns.ending_this_week },
                  ].map((item) => (
                    <Col xs={24} sm={12} key={item.label}>
                      <Card bordered={false} style={cardStyle} styles={{ body: { padding: 16 } }}>
                        <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                          {item.label}
                        </Text>
                        <Text strong style={{ fontSize: 20, color: "#1f1f1f" }}>
                          {item.value.toLocaleString()}
                        </Text>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </>
            )}
            {selectedSummaryCard === "leads" && (
              <>
                <Text type="secondary">Lead performance within the selected date range.</Text>
                <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
                  {[
                    { label: "Total leads", value: summary.leads.total },
                    { label: "Today", value: summary.leads.today },
                    { label: "Qualified", value: summary.leads.qualified },
                    { label: "Disqualified", value: summary.leads.disqualified },
                    { label: "Qualification rate", value: `${summary.leads.qualification_rate_pct}%` },
                    { label: "Today conversion", value: `${summary.leads.today_conversion_rate_pct}%` },
                  ].map((item) => (
                    <Col xs={24} sm={12} key={item.label}>
                      <Card bordered={false} style={cardStyle} styles={{ body: { padding: 16 } }}>
                        <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                          {item.label}
                        </Text>
                        <Text strong style={{ fontSize: 20, color: "#1f1f1f" }}>
                          {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
                        </Text>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </>
            )}
            {selectedSummaryCard === "agents" && (
              <>
                <Text type="secondary">People metrics for the selected range and scope.</Text>
                <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
                  {[
                    { label: "Total team leaders", value: summary.people.total_team_leaders },
                    { label: "Total agents", value: summary.people.total_agents },
                    { label: "Active agents", value: summary.people.active_agents },
                    { label: "Inactive agents", value: summary.people.inactive_agents },
                    { label: "Avg leads per team", value: summary.people.avg_leads_per_team },
                  ].map((item) => (
                    <Col xs={24} sm={12} key={item.label}>
                      <Card bordered={false} style={cardStyle} styles={{ body: { padding: 16 } }}>
                        <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                          {item.label}
                        </Text>
                        <Text strong style={{ fontSize: 20, color: "#1f1f1f" }}>
                          {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
                        </Text>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </>
            )}
            {selectedSummaryCard === "avg" && (
              <>
                <Text type="secondary">Average lead productivity across active teams.</Text>
                <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
                  {[
                    { label: "Avg leads / agent", value: summary.people.avg_leads_per_agent },
                    { label: "Team leaders", value: summary.people.total_team_leaders },
                    { label: "Active agents", value: summary.people.active_agents },
                    { label: "Total leads", value: summary.leads.total },
                  ].map((item) => (
                    <Col xs={24} sm={12} key={item.label}>
                      <Card bordered={false} style={cardStyle} styles={{ body: { padding: 16 } }}>
                        <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                          {item.label}
                        </Text>
                        <Text strong style={{ fontSize: 20, color: "#1f1f1f" }}>
                          {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
                        </Text>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </>
            )}
          </>
        ) : (
          <Skeleton active paragraph={{ rows: 6 }} />
        )}
      </Drawer>

      <Drawer
        title={
          <div>
            <Text strong style={{ fontSize: 18 }}>
              {selectedCampaign?.campaign_name ?? "Campaign details"}
            </Text>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
              {selectedCampaign?.campaign_code && (
                <Tag style={{ margin: 0 }}>{selectedCampaign.campaign_code}</Tag>
              )}
              {selectedCampaign?.status && (
                <Tag color={statusColors[selectedCampaign.status] ?? "default"} style={{ margin: 0, textTransform: "capitalize" }}>
                  {selectedCampaign.status}
                </Tag>
              )}
              <Text type="secondary" style={{ fontSize: 12 }}>
                {selectedCampaign?.start_date ?? "—"} → {selectedCampaign?.end_date ?? "—"}
              </Text>
            </div>
          </div>
        }
        width={isCompact ? "85%" : "60%"}
        onClose={closeCampaignDrawer}
        open={Boolean(selectedCampaignId)}
        bodyStyle={{ padding: isCompact ? 14 : 20 }}
        rootClassName="om-dashboard-drawer"
      >
        {selectedCampaignDetailQuery.isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : selectedCampaignDetail ? (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              {[
                {
                  label: "Total allocation",
                  value: selectedCampaign?.total_allocation ?? 0,
                  color: "#0891b2",
                },
                {
                  label: "Total leads",
                  value: selectedCampaignDetail.summary.total_leads,
                  color: "#8b5cf6",
                },
                {
                  label: "Qualified leads",
                  value: selectedCampaign?.qualified_leads ?? 0,
                  color: "#22c55e",
                },
                {
                  label: "Disqualified leads",
                  value: selectedCampaignDisqualified,
                  color: "#f97316",
                },
                {
                  label: "MIS delivered",
                  value: selectedCampaignMisDelivered,
                  color: "#0ea5e9",
                },
              ].map((item) => (
                <Col xs={12} flex="1 1 180px" key={item.label}>
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #f0f0f0",
                      borderRadius: 14,
                      padding: "14px 16px",
                      height: "100%",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: 500,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: item.color,
                      }}
                    >
                      {item.value.toLocaleString()}
                    </div>
                  </div>
                </Col>
              ))}
            </Row>

            <Card
              title="Agent coverage"
              bordered={false}
              style={{ ...cardStyle, marginBottom: 16, borderTop: "4px solid #4f46e5" }}
              bodyStyle={{ padding: 16 }}
            >
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                <Text type="secondary" style={{ marginBottom: 0 }}>
                  Agents with uploads in this date range for the selected campaign.
                </Text>
                <Select
                  value={selectedCampaignTlId}
                  onChange={(value) => setSelectedCampaignTlId(value)}
                  allowClear
                  style={{ minWidth: isCompact ? 160 : 220 }}
                  placeholder="Filter by team leader"
                  options={selectedCampaignTlOptions}
                  size={isCompact ? "small" : "middle"}
                />
              </div>
              <Table
                dataSource={filteredCampaignAgents}
                rowKey="agent_id"
                pagination={false}
                size="small"
                scroll={isCompact ? { x: 480 } : undefined}
                columns={[
                  { title: "Agent", dataIndex: "agent_name", key: "agent_name" },
                  { title: "TL", dataIndex: "tl_name", key: "tl_name" },
                  { title: "Leads", dataIndex: "total_leads", key: "total_leads", width: 90 },
                  { title: "Qualified", dataIndex: "qualified_leads", key: "qualified_leads", width: 90 },
                ]}
              />
            </Card>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card
                  title="QA audit breakdown"
                  bordered={false}
                  style={{ ...cardStyle, borderTop: "4px solid #8b5cf6" }}
                  bodyStyle={{ padding: 16 }}
                >
                  <Text type="secondary">QA activity for the selected date range.</Text>
                  <Table
                    dataSource={selectedCampaignDetail.qa_summaries.slice(0, 6)}
                    rowKey="qa_id"
                    pagination={false}
                    size="small"
                    style={{ marginTop: 12 }}
                    scroll={isCompact ? { x: 480 } : undefined}
                    columns={[
                      { title: "QA", dataIndex: "qa_name", key: "qa_name" },
                      { title: "Audited", dataIndex: "total_audited", key: "total_audited", width: 90 },
                      { title: "Qualified", dataIndex: "qualified_leads", key: "qualified_leads", width: 90 },
                      { title: "Disqualified", dataIndex: "disqualified_leads", key: "disqualified_leads", width: 90 },
                      {
                        title: "Pending",
                        key: "pending",
                        width: 90,
                        render: () => <Text type="secondary">—</Text>,
                      },
                    ]}
                    summary={() => {
                      const qualified = selectedCampaign?.qualified_leads ?? 0;
                      const disqualified = selectedCampaignDisqualified;
                      const audited = qualified + disqualified;
                      const pendingAudit = Math.max(
                        0,
                        selectedCampaignDetail.summary.total_leads - audited
                      );
                      return (
                       <Table.Summary.Row>
  <Table.Summary.Cell index={0}>
    <Text strong style={{ color: "#ff4d4f" }}>Total</Text>
  </Table.Summary.Cell>

  <Table.Summary.Cell index={1}>
    <Text strong style={{ color: "#1677ff" }}>
      {audited.toLocaleString()}
    </Text>
  </Table.Summary.Cell>

  <Table.Summary.Cell index={2}>
    <Text strong style={{ color: "#52c41a" }}>
      {qualified.toLocaleString()}
    </Text>
  </Table.Summary.Cell>

  <Table.Summary.Cell index={3}>
    <Text strong style={{ color: "#ff4d4f" }}>
      {disqualified.toLocaleString()}
    </Text>
  </Table.Summary.Cell>

  <Table.Summary.Cell index={4}>
    <Text strong style={{ color: "#faad14" }}>
      {pendingAudit.toLocaleString()}
    </Text>
  </Table.Summary.Cell>
</Table.Summary.Row>
                      );
                    }}
                  />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card
                  title="MIS involvement"
                  bordered={false}
                  style={{ ...cardStyle, borderTop: "4px solid #0ea5e9" }}
                  bodyStyle={{ padding: 16 }}
                >
                  <Text type="secondary">MIS delivery contributors for the selected period.</Text>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="MIS delivery breakdown is not available on this view yet."
                    style={{ marginTop: 24 }}
                  />
                </Card>
              </Col>
            </Row>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 40 }}>
            <UserOutlined style={{ fontSize: 32, color: "#d1d5db" }} />
            <div style={{ marginTop: 12, color: "#6b7280" }}>Select a campaign to view details</div>
          </div>
        )}
      </Drawer>

      <Drawer
        title={
          <div>
            <Text strong style={{ fontSize: 18 }}>
              {drawerTitle}
            </Text>
            {agentProfile?.agent.agent_code ? (
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Code {agentProfile.agent.agent_code}
                </Text>
              </div>
            ) : null}
          </div>
        }
        width={isCompact ? "85%" : "50%"}
        onClose={closeDrawer}
        open={Boolean(selectedAgentId)}
        bodyStyle={{ padding: isCompact ? 14 : 24 }}
        rootClassName="om-dashboard-drawer"
      >
        {drawerLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : agentProfile ? (
          <Space direction="vertical" size={20} style={{ width: "100%" }}>
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                  Email
                </Text>
                <Text>{agentProfile.agent.email ?? "—"}</Text>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                  Status
                </Text>
                <Tag color={agentProfile.agent.status === "active" ? "green" : "default"}>
                  {agentProfile.agent.status}
                </Tag>
              </Col>
              {agentProfile.agent.department ? (
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                    Department
                  </Text>
                  <Text>{agentProfile.agent.department}</Text>
                </Col>
              ) : null}
              {agentProfile.agent.designation ? (
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                    Designation
                  </Text>
                  <Text>{agentProfile.agent.designation}</Text>
                </Col>
              ) : null}
            </Row>

            <div>
              <Text strong style={{ fontSize: 16, display: "block", marginBottom: 4 }}>
                Assigned campaigns
              </Text>
              <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                Lead activity for {agentProfile.date_range.start} to {agentProfile.date_range.end}
              </Text>
              {agentCampaignRows.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No assigned campaigns for this agent"
                />
              ) : (
                <Table
                  dataSource={agentCampaignRows}
                  rowKey="campaign_id"
                  pagination={false}
                  size={isCompact ? "small" : "middle"}
                  columns={agentCampaignColumns}
                  scroll={isCompact ? { x: 720 } : undefined}
                  summary={(pageData) => {
                    const totals = pageData.reduce(
                      (acc, row) => ({
                        total_leads: acc.total_leads + row.total_leads,
                        qualified_leads: acc.qualified_leads + row.qualified_leads,
                        disqualified_leads: acc.disqualified_leads + row.disqualified_leads,
                        delivered_leads: acc.delivered_leads + row.delivered_leads,
                      }),
                      {
                        total_leads: 0,
                        qualified_leads: 0,
                        disqualified_leads: 0,
                        delivered_leads: 0,
                      }
                    );

                    return (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}>
                          <Text strong>Total</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} />
                        <Table.Summary.Cell index={2} align="center">
                          <Text strong>{totals.total_leads.toLocaleString()}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="center">
                          <Text strong>{totals.qualified_leads.toLocaleString()}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="center">
                          <Text strong>{totals.disqualified_leads.toLocaleString()}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="center">
                          <Text strong>{totals.delivered_leads.toLocaleString()}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    );
                  }}
                />
              )}
            </div>
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Agent details unavailable" />
        )}
      </Drawer>

      <Drawer
        title={
          <div>
            <Text strong style={{ fontSize: 18 }}>
              {tlProfile?.team_leader.full_name ?? "Team leader details"}
            </Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {tlProfile
                  ? `${tlProfile.agent_count} agents · ${tlProfile.campaigns.length} campaigns`
                  : "Loading team details…"}
              </Text>
            </div>
          </div>
        }
        width={isCompact ? "85%" : "50%"}
        onClose={closeTlDrawer}
        open={Boolean(selectedTlId)}
        bodyStyle={{ padding: isCompact ? 14 : 24 }}
        rootClassName="om-dashboard-drawer"
      >
        {tlDrawerLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : tlProfile ? (
          <Space direction="vertical" size={20} style={{ width: "100%" }}>
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                  Email
                </Text>
                <Text>{tlProfile.team_leader.email ?? "—"}</Text>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                  Status
                </Text>
                <Tag color={tlProfile.team_leader.status === "active" ? "green" : "default"}>
                  {tlProfile.team_leader.status}
                </Tag>
              </Col>
            </Row>

            <div>
              <Text strong style={{ fontSize: 16, display: "block", marginBottom: 4 }}>
                Campaigns
              </Text>
              <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                Team lead activity for {tlProfile.date_range.start} to {tlProfile.date_range.end}
              </Text>
              {tlCampaignRows.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No campaigns assigned to this team leader"
                />
              ) : (
                <Table
                  dataSource={tlCampaignRows}
                  rowKey="campaign_id"
                  pagination={false}
                  size={isCompact ? "small" : "middle"}
                  columns={tlCampaignColumns}
                  scroll={isCompact ? { x: 780 } : undefined}
                  summary={(pageData) => {
                    const totals = pageData.reduce(
                      (acc, row) => ({
                        agents_count: acc.agents_count + row.agents_count,
                        total_leads: acc.total_leads + row.total_leads,
                        qualified_leads: acc.qualified_leads + row.qualified_leads,
                        disqualified_leads: acc.disqualified_leads + row.disqualified_leads,
                        delivered_leads: acc.delivered_leads + row.delivered_leads,
                      }),
                      {
                        agents_count: 0,
                        total_leads: 0,
                        qualified_leads: 0,
                        disqualified_leads: 0,
                        delivered_leads: 0,
                      }
                    );

                    return (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}>
                          <Text strong>Total</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="center">
                          <Text strong>{totals.agents_count.toLocaleString()}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="center">
                          <Text strong>{totals.total_leads.toLocaleString()}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="center">
                          <Text strong>{totals.qualified_leads.toLocaleString()}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="center">
                          <Text strong>{totals.disqualified_leads.toLocaleString()}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="center">
                          <Text strong>{totals.delivered_leads.toLocaleString()}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    );
                  }}
                />
              )}
            </div>
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Team leader details unavailable" />
        )}
      </Drawer>
    </div>
  );
}
