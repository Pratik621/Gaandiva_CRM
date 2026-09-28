"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { CSSProperties, Key } from "react";
import {
  Tabs,
  Card,
  Tag,
  Table,
  message,
  Skeleton,
  Alert,
  Typography,
  Progress,
  Space,
  Badge,
  Button,
  Tooltip,
  DatePicker,
  Divider,
  Select,
  Input,
} from "antd";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import {
  AlertOutlined,
  ExclamationCircleOutlined,
  UnorderedListOutlined,
  HistoryOutlined,
  BarChartOutlined,
  FundProjectionScreenOutlined,
  DownloadOutlined,
  SearchOutlined,
  FileOutlined,
  PlusOutlined,
  MinusOutlined,
  CaretUpOutlined,
  CaretDownOutlined,
  MessageOutlined,
  ArrowLeftOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import AlertsPanel from "./AlertsPanel";
import QAPanel from "./QAPanel";
import LeadAuditPanel from "./LeadAuditPanel";
import CampaignLeadMetricsTab from "./CampaignLeadMetricsTab";
import CampaignAverageAnalysisTab from "./CampaignAverageAnalysisTab";
import CampaignFeedTab from "./CampaignFeedTab";
import { useAuth } from "@/context/AuthContext";
import { useAuthReady } from "@/hooks/useAuthReady";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";
import { campaignHeaderDisplayCode } from "@/lib/campaign-display";
import {
  applyLeadTableHeaderCells,
  getLeadTableColumns,
} from "@/components/Leads/LeadTableColumns";
import {
  clientViewerHidesAppointment,
  clientViewerShowsLhoFile,
  isAgCampaignType,
} from "@/lib/command/client-viewer-lead-columns";
import {
  getKstagnitoLeadTimestampDate,
  shouldShowKstagnitoTimestampDateColumn,
} from "@/lib/command/client-viewer-scope";
import { formatEarnedRevenue } from "@/lib/campaign-revenue-metrics";
import { hasCampaignFeedRole } from "@/lib/command/campaign-feed-access";
import { CampaignFeedChatWidget } from "@/components/command/CampaignFeedChatWidget";
import { useCampaignFeedUnread } from "@/hooks/useCampaignFeedUnread";

const { Text, Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;

function formatCampaignDateRange(start: string | null, end: string | null): string {
  const s = start && dayjs(start).isValid() ? dayjs(start).format("MMM D, YYYY") : null;
  const e = end && dayjs(end).isValid() ? dayjs(end).format("MMM D, YYYY") : null;
  if (s && e) return `${s} — ${e}`;
  if (s) return s;
  if (e) return e;
  return "—";
}

interface CampaignAnalytics {
  metrics: {
    sponsor_name?: string;
    total_leads_allocated?: number;
    total_campaign_spend?: number;
    total_leads_delivered?: number;
    deficit_leads?: number;
    lead_increment?: number;
    lead_replace?: number;
    daily_reporting?: Record<string, unknown>;
    channel_split?: Record<string, number>;
  } | null;
  leads: {
    total: number;
    statusBreakdown: Record<string, number>;
    consentBreakdown: Record<string, number>;
    channelBreakdown: Record<string, number>;
    dailyLeads: { date: string; count: number }[];
  };
  trends?: {
    rangeStart: string;
    rangeEnd: string;
    daily: {
      date: string;
      leadVolume: number;
      qualificationRate: number | null;
      dqRate: number | null;
      registrationRate: number;
    }[];
    weekly: {
      period: string;
      leadVolume: number;
      qualificationRate: number | null;
      dqRate: number | null;
      registrationRate: number;
    }[];
    monthly: {
      period: string;
      month: string;
      leadVolume: number;
      qualificationRate: number | null;
      dqRate: number | null;
      registrationRate: number;
    }[];
  };
  alerts: { id: string; severity: string; is_resolved: boolean }[];
}

type LeadPanelFilters = {
  channels: string[];
  statuses: string[];
  dateFrom: string | null;
  dateTo: string | null;
  /** Lead ID, name, company, email, phone (server-side ilike). */
  search: string;
};

interface LeadRow {
  id: string;
  organization_id?: string;
  campaign_id?: string;
  name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name: string | null;
  job_title?: string | null;
  phone?: string | null;
  city?: string | null;
  email: string | null;
  status: string;
  consent_status: string | null;
  channel: string | null;
  lead_tagging?: string | null;
  followup_date?: string | null;
  notes?: string | null;
  ingested_at?: string | null;
  qualified_at?: string | null;
  registered_at?: string | null;
  dq_reason_code?: string | null;
  delivery_status?: string | null;
  rep_id?: string | null;
  assigned_agent_id?: string | null;
  assigned_user?: {
    full_name?: string | null;
    email?: string | null;
    agent_code?: string | null;
    employee_id?: string | null;
  } | null;
  created_at: string;
  updated_at?: string;
  risk_flags: unknown;
  last_action?: string | null;
  last_action_at?: string | null;
}

interface CampaignDetail {
  id: string;
  name: string;
  campaign_id: string;
  campaign_code?: string | null;
  status: string;
  campaign_type?: string | null;
  /** Lead aggregate label (campaigns.lead_aggregated). */
  lead_aggregated?: string | null;
  client_name: string | null;
  industry: string | null;
  geography: string | null;
  revenue_size?: string[] | null;
  lead_type: string | null;
  cpl: number | null;
  revenue?: number | null;
  total_allocation: number | null;
  achieved: number | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  campaign_files?: {
    id: string;
    file_name: string;
    file_path: string;
    created_at: string;
    download_url?: string | null;
  }[] | null;
  clients?: { company_name?: string | null }[] | { company_name?: string | null } | null;
  campaign_metrics?: {
    sponsor_name?: string | null;
    total_leads_allocated?: number | null;
    total_campaign_spend?: number | null;
    total_leads_delivered?: number | null;
    daily_reporting?: Record<string, unknown> | null;
    channel_split?: Record<string, unknown> | null;
    deficit_leads?: number | null;
    lead_increment?: number | null;
    lead_replace?: number | null;
  }[] | {
    sponsor_name?: string | null;
    total_leads_allocated?: number | null;
    total_campaign_spend?: number | null;
    total_leads_delivered?: number | null;
    daily_reporting?: Record<string, unknown> | null;
    channel_split?: Record<string, unknown> | null;
    deficit_leads?: number | null;
    lead_increment?: number | null;
    lead_replace?: number | null;
  };
}

interface CampaignDashboardProps {
  campaignId: string;
  /** Opens this tab on load (e.g. `alerts` from `?tab=alerts`). */
  initialTab?: string | null;
  initialDeliveryStatus?: string | null;
  /** Notifies parent when full-page feed mode toggles. */
  onFeedModeChange?: (isFeedView: boolean) => void;
  /**
   * client_viewer sticky chrome: Back + optional View Report stay pinned with tabs.
   * When set, parent should not render its own toolbar.
   */
  clientViewerChrome?: {
    onBack: () => void;
    onViewReport?: () => void;
  };
}

interface CampaignMetricsHistoryRow {
  id: string;
  date: string;
  total_leads_delivered: number | null;
  total_campaign_spend: number | null;
  deficit_leads: number | null;
  lead_increment: number | null;
  lead_replace: number | null;
  channel_split: Record<string, unknown> | null;
  updated_by_user?: { full_name: string | null; email: string | null } | null;
  created_at: string;
}

const CHANNEL_FILTER_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "telemarketing", label: "Telemarketing" },
];

function defaultLeadPanelFilters(): LeadPanelFilters {
  return {
    channels: [],
    statuses: [],
    dateFrom: null,
    dateTo: null,
    search: "",
  };
}

function renderDescriptionWithLinks(raw: string) {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l, idx, arr) => l.length > 0 || (idx > 0 && arr[idx - 1].length > 0));

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return lines.map((line, lineIdx) => {
    const parts = line.split(urlRegex);
    return (
      <div key={`desc-line-${lineIdx}`} style={{ marginBottom: 6 }}>
        {parts.map((part, partIdx) => {
          if (!part) return null;
          if (part.startsWith("http://") || part.startsWith("https://")) {
            return (
              <a
                key={`desc-part-${lineIdx}-${partIdx}`}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#4f46e5",
                  textDecoration: "underline",
                  wordBreak: "break-all",
                }}
              >
                {part}
              </a>
            );
          }
          return <span key={`desc-part-${lineIdx}-${partIdx}`}>{part}</span>;
        })}
      </div>
    );
  });
}

function ChannelSplitMiniBar({ email, tele }: { email: number; tele: number }) {
  const total = email + tele;
  if (total <= 0) {
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        No channel data
      </Text>
    );
  }
  const emailPct = (email / total) * 100;
  const telePct = (tele / total) * 100;
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 10,
          borderRadius: 5,
          overflow: "hidden",
          background: "#f0f0f0",
        }}
      >
        {email > 0 && (
          <Tooltip title={`Email: ${email}`}>
            <div
              style={{
                width: `${emailPct}%`,
                minWidth: email > 0 ? 3 : 0,
                background: "#4f46e5",
                transition: "width 0.2s ease",
              }}
            />
          </Tooltip>
        )}
        {tele > 0 && (
          <Tooltip title={`Telemarketing: ${tele}`}>
            <div
              style={{
                width: `${telePct}%`,
                minWidth: tele > 0 ? 3 : 0,
                background: "#722ed1",
                transition: "width 0.2s ease",
              }}
            />
          </Tooltip>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          fontSize: 11,
          color: "#6b7280",
        }}
      >
        <span>Email {email}</span>
        <span>Tele {tele}</span>
      </div>
    </div>
  );
}

export default function CampaignDashboard({
  campaignId,
  initialTab,
  initialDeliveryStatus,
  onFeedModeChange,
  clientViewerChrome,
}: CampaignDashboardProps) {
  const { hasRole, roles, authVersion, user } = useAuth();
  const authReady = useAuthReady();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const leadsInitialLoadDoneRef = useRef(false);
  const leadsFetchGenRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState<CampaignMetricsHistoryRow[]>([]);
  const [auditLeadId, setAuditLeadId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("leads");
  const [feedChatOpen, setFeedChatOpen] = useState(
    () => initialTab?.toLowerCase() !== "feed"
  );
  const [trendRangeOverride, setTrendRangeOverride] = useState<{ from: string; to: string } | null>(
    null
  );
  const [leadPanelFilters, setLeadPanelFilters] = useState<LeadPanelFilters>(defaultLeadPanelFilters);
  const [leadSearchDraft, setLeadSearchDraft] = useState("");
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadPage, setLeadPage] = useState(1);
  const [leadPageSize, setLeadPageSize] = useState(25);
  const [leadSortField, setLeadSortField] = useState("created_at");
  const [leadSortOrder, setLeadSortOrder] = useState<"ascend" | "descend">("descend");
  const [selectedLeadKeys, setSelectedLeadKeys] = useState<Key[]>([]);
  const [allocationSaving, setAllocationSaving] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const stickyScrollYRef = useRef(0);
  const stickyHeaderHiddenRef = useRef(false);
  const stickyScrollAccRef = useRef(0);
  const clientViewerChromeRef = useRef<HTMLDivElement | null>(null);
  /** Allocation snapshot when this campaign was first shown (for % trend vs initial). */
  const [allocationBaseline, setAllocationBaseline] = useState<number | null>(null);

  const isClientViewer = hasRole("client_viewer");
  const useClientViewerChrome = Boolean(isClientViewer && clientViewerChrome);
  const isKstagnitoViewer =
    (user?.email ?? "").trim().toLowerCase() === "kstagnito2@rh-hub.com";
  const showFeedTab = hasCampaignFeedRole(
    roles.map((r) => (typeof r === "string" ? r : (r.role_name ?? r.name ?? "")))
  );
  const canBulkSelect =
    hasRole("internal_operator") || hasRole("internal_admin") || hasRole("admin");
  const canAdjustAllocation =
    !isClientViewer &&
    (hasRole("internal_operator") || hasRole("internal_admin") || hasRole("admin"));

  useEffect(() => {
    if (!initialTab) return;
    const t = initialTab.toLowerCase();
    if ((t === "qa" || t === "alerts") && isClientViewer) return;
    const allowed = new Set([
      "metrics",
      "average_analysis",
      "description",
      "leads",
      "files",
      ...(showFeedTab ? (["feed"] as const) : []),
      ...(isClientViewer ? [] : (["alerts", "qa"] as const)),
      "history",
    ]);
    if (allowed.has(t)) {
      setActiveTab(t);
      if (t === "feed") setFeedChatOpen(false);
    }
  }, [initialTab, isClientViewer, showFeedTab]);

  useEffect(() => {
    setAllocationBaseline(null);
    leadsInitialLoadDoneRef.current = false;
    leadsFetchGenRef.current += 1;
    setLeadPage(1);
  }, [campaignId]);
  useEffect(() => {
    setDescriptionExpanded(false);
  }, [campaignId]);

  // Internal roles: sticky meta/KPI bar auto-hides on scroll-down (transform-only).
  // client_viewer: meta scrolls away; Back + View Report + tabs stay pinned instead.
  useEffect(() => {
    if (useClientViewerChrome || loading) return;
    const node = stickyHeaderRef.current;
    if (!node) return;

    const getScrollParent = (el: HTMLElement): HTMLElement | Window => {
      let parent = el.parentElement;
      while (parent) {
        const { overflowY } = window.getComputedStyle(parent);
        if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
          return parent;
        }
        parent = parent.parentElement;
      }
      return window;
    };

    const scrollParent = getScrollParent(node);
    const readY = () =>
      scrollParent === window
        ? window.scrollY || document.documentElement.scrollTop
        : (scrollParent as HTMLElement).scrollTop;

    const applyHidden = (hidden: boolean) => {
      if (stickyHeaderHiddenRef.current === hidden) return;
      stickyHeaderHiddenRef.current = hidden;
      // transform-only: no layout height change → no scroll jump / blink
      node.style.transform = hidden
        ? "translate3d(0, calc(-100% - var(--app-content-padding, 24px)), 0)"
        : "translate3d(0, 0, 0)";
      node.style.pointerEvents = hidden ? "none" : "auto";
      node.style.boxShadow = hidden ? "none" : "0 4px 12px rgba(0,0,0,0.06)";
      node.style.borderBottomColor = hidden ? "transparent" : "#f0f0f0";
    };

    stickyScrollYRef.current = readY();
    stickyScrollAccRef.current = 0;
    applyHidden(false);

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const y = readY();
        const delta = y - stickyScrollYRef.current;
        stickyScrollYRef.current = y;

        if (y <= 4) {
          stickyScrollAccRef.current = 0;
          applyHidden(false);
          return;
        }

        stickyScrollAccRef.current += delta;
        if (stickyScrollAccRef.current > 28) {
          stickyScrollAccRef.current = 0;
          applyHidden(true);
        } else if (stickyScrollAccRef.current < -28) {
          stickyScrollAccRef.current = 0;
          applyHidden(false);
        }
      });
    };

    scrollParent.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollParent.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
      stickyHeaderHiddenRef.current = false;
      node.style.transform = "translate3d(0, 0, 0)";
      node.style.pointerEvents = "auto";
      node.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)";
      node.style.borderBottomColor = "#f0f0f0";
    };
  }, [campaignId, loading, useClientViewerChrome]);

  useEffect(() => {
    if (!useClientViewerChrome) {
      document.documentElement.style.removeProperty("--cv-campaign-toolbar-h");
      return;
    }
    const el = clientViewerChromeRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        "--cv-campaign-toolbar-h",
        `${el.offsetHeight}px`
      );
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--cv-campaign-toolbar-h");
    };
  }, [useClientViewerChrome, activeTab, clientViewerChrome?.onViewReport]);

  useEffect(() => {
    onFeedModeChange?.(activeTab === "feed");
  }, [activeTab, onFeedModeChange]);

  const isFeedView = showFeedTab && activeTab === "feed";
  const { unreadCount, markRead } = useCampaignFeedUnread({
    campaignId,
    enabled: showFeedTab && Boolean(campaign),
    paused: isFeedView || feedChatOpen,
  });

  useEffect(() => {
    if (isFeedView || feedChatOpen) void markRead();
  }, [isFeedView, feedChatOpen, markRead]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (trendRangeOverride) {
        sp.set("date_from", trendRangeOverride.from);
        sp.set("date_to", trendRangeOverride.to);
      }
      const qs = sp.toString();
      const analyticsUrl = `/api/command/campaigns/${campaignId}/analytics${qs ? `?${qs}` : ""}`;
      const [campRes, analyticsRes] = await Promise.all([
        fetchWithAuthRetry(`/api/command/campaigns/${campaignId}`),
        fetchWithAuthRetry(analyticsUrl),
      ]);

      const campData = await campRes.json() as { campaign?: CampaignDetail };
      const analyticsData = await analyticsRes.json() as CampaignAnalytics;

      setCampaign(campData.campaign ?? null);
      setAnalytics(analyticsData);
    } catch {
      message.error("Failed to load campaign data");
    } finally {
      setLoading(false);
    }
  }, [campaignId, trendRangeOverride]);

  useEffect(() => {
    if (loading || !campaign) return;
    const m = Array.isArray(campaign.campaign_metrics)
      ? campaign.campaign_metrics[0]
      : campaign.campaign_metrics;
    const v = Number(campaign.total_allocation ?? m?.total_leads_allocated ?? 0) || 0;
    setAllocationBaseline((b) => (b === null ? v : b));
  }, [loading, campaign]);

  const adjustAllocation = useCallback(
    async (delta: number) => {
      if (!canAdjustAllocation || delta === 0) return;
      setAllocationSaving(true);
      try {
        const resGet = await fetchWithAuthRetry(`/api/command/campaigns/${campaignId}`);
        const d = (await resGet.json()) as { campaign?: CampaignDetail };
        const c = d.campaign;
        if (!c) throw new Error("Campaign not found");
        const m = Array.isArray(c.campaign_metrics) ? c.campaign_metrics[0] : c.campaign_metrics;
        const current = Number(c.total_allocation ?? m?.total_leads_allocated ?? 0) || 0;
        const next = Math.max(0, current + delta);
        if (next === current) {
          if (delta < 0) message.info("Allocation is already at the minimum (0).");
          return;
        }
        const res = await fetchWithAuthRetry(`/api/command/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            total_allocation: next,
            total_leads_allocated: next,
          }),
        });
        const patchData = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(patchData.error ?? "Failed to update allocation");
        message.success(delta > 0 ? "Allocation increased" : "Allocation decreased");
        await fetchData();
      } catch (e) {
        message.error(e instanceof Error ? e.message : "Update failed");
      } finally {
        setAllocationSaving(false);
      }
    },
    [campaignId, canAdjustAllocation, fetchData]
  );

  const fetchLeads = useCallback(async () => {
    const silent = leadsInitialLoadDoneRef.current;
    leadsInitialLoadDoneRef.current = true;
    const gen = ++leadsFetchGenRef.current;
    if (!silent) setLeadsLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set("campaign_id", campaignId);
      sp.set("limit", String(leadPageSize));
      sp.set("offset", String((leadPage - 1) * leadPageSize));
      sp.set("sort", leadSortField);
      sp.set("sort_dir", leadSortOrder === "ascend" ? "asc" : "desc");
      const f = leadPanelFilters;
      if (f.statuses.length > 0) sp.set("status_in", f.statuses.join(","));
      if (f.channels.length > 0) sp.set("channel_in", f.channels.join(","));
      if (f.dateFrom) sp.set("date_from", f.dateFrom);
      if (f.dateTo) sp.set("date_to", f.dateTo);
      if (f.search) sp.set("q", f.search);
      if (initialDeliveryStatus === "delivered" || initialDeliveryStatus === "not_delivered") {
        sp.set("delivery_status", initialDeliveryStatus);
      }
      const res = await fetchWithAuthRetry(`/api/command/leads?${sp.toString()}`);
      const data = (await res.json()) as { leads?: LeadRow[]; total?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load leads");
      if (gen !== leadsFetchGenRef.current) return;
      setLeads(data.leads ?? []);
      setLeadsTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      if (gen !== leadsFetchGenRef.current) return;
      message.error("Failed to load leads");
    } finally {
      if (gen === leadsFetchGenRef.current && !silent) {
        setLeadsLoading(false);
      }
    }
  }, [
    campaignId,
    initialDeliveryStatus,
    leadPage,
    leadPageSize,
    leadSortField,
    leadSortOrder,
    leadPanelFilters,
  ]);

  const exportLeadsCsv = useCallback(() => {
    const sp = new URLSearchParams();
    sp.set("campaign_id", campaignId);
    sp.set("format", "csv");
    sp.set("sort", leadSortField);
    sp.set("sort_dir", leadSortOrder === "ascend" ? "asc" : "desc");
    const f = leadPanelFilters;
    if (f.statuses.length > 0) sp.set("status_in", f.statuses.join(","));
    if (f.channels.length > 0) sp.set("channel_in", f.channels.join(","));
    if (f.dateFrom) sp.set("date_from", f.dateFrom);
    if (f.dateTo) sp.set("date_to", f.dateTo);
    if (f.search) sp.set("q", f.search);
    if (initialDeliveryStatus === "delivered" || initialDeliveryStatus === "not_delivered") {
      sp.set("delivery_status", initialDeliveryStatus);
    }
    window.open(`/api/command/leads?${sp.toString()}`, "_blank", "noopener,noreferrer");
  }, [campaignId, initialDeliveryStatus, leadPanelFilters, leadSortField, leadSortOrder]);

  const fetchMetricsHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetchWithAuthRetry(`/api/command/campaigns/${campaignId}/history?limit=180`);
      const data = (await res.json()) as { history?: CampaignMetricsHistoryRow[] };
      setMetricsHistory(data.history ?? []);
    } catch {
      message.error("Failed to load campaign history");
    } finally {
      setHistoryLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (!authReady) return;
    void fetchData();
    // `authVersion` refetches after cross-tab token rotation / tab return.
  }, [authReady, authVersion, fetchData]);

  useEffect(() => {
    if (!authReady) return;
    if (activeTab === "leads") {
      void fetchLeads();
    }
    if (activeTab === "history") {
      void fetchMetricsHistory();
    }
    return () => {
      leadsFetchGenRef.current += 1;
    };
  }, [authReady, authVersion, activeTab, fetchLeads, fetchMetricsHistory]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = leadSearchDraft.trim();
      setLeadPanelFilters((p) => (p.search === next ? p : { ...p, search: next }));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [leadSearchDraft]);

  useEffect(() => {
    setLeadPage(1);
    setSelectedLeadKeys([]);
  }, [leadPanelFilters]);

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    );
  }
  if (!campaign) {
    return (
      <div style={{ padding: 24 }}>
        <Alert message="Campaign not found" type="error" />
      </div>
    );
  }
  const headerCode = campaignHeaderDisplayCode(campaign);
  const metrics = Array.isArray(campaign.campaign_metrics)
    ? campaign.campaign_metrics[0]
    : campaign.campaign_metrics;
  const channelSplitFromMetrics =
    metrics?.channel_split && typeof metrics.channel_split === "object"
      ? (metrics.channel_split as Record<string, number>)
      : {};

  const openAlerts = isClientViewer
    ? 0
    : (analytics?.alerts.filter((a) => !a.is_resolved).length ?? 0);
  const criticalAlerts = isClientViewer
    ? 0
    : (analytics?.alerts.filter((a) => !a.is_resolved && a.severity === "critical").length ?? 0);

  const channelSource =
    Object.keys(channelSplitFromMetrics).length > 0
      ? channelSplitFromMetrics
      : (analytics?.leads.channelBreakdown ?? {});

  const emailLeads = Number(
    (channelSource as Record<string, unknown>).email ??
      (channelSource as Record<string, unknown>).Email ??
      0
  );
  const teleLeads = Number(
    (channelSource as Record<string, unknown>).telemarketing ??
      (channelSource as Record<string, unknown>).Telemarketing ??
      0
  );

  const totalLeadsKpi = analytics?.leads.total ?? 0;

  const allocationNow =
    Number(campaign.total_allocation ?? metrics?.total_leads_allocated ?? 0) || 0;
  const allocationBaselineValue = allocationBaseline ?? allocationNow;
  const allocationDelta = allocationNow - allocationBaselineValue;
  const allocationTrendPct = (() => {
    if (allocationBaselineValue <= 0) return allocationNow > 0 ? 100 : 0;
    return Math.round((Math.abs(allocationDelta) / allocationBaselineValue) * 1000) / 10;
  })();

  /** Remaining lead quota vs delivered: total allocation − total leads in scope. */
  const deficitLeadsKpi = allocationNow - totalLeadsKpi;

  const leadColumns: ColumnsType<LeadRow> = (() => {
    const showKstagnitoTimestamp = shouldShowKstagnitoTimestampDateColumn(
      user?.email,
      campaignId
    );
    const base = applyLeadTableHeaderCells(
      getLeadTableColumns({
        showActions: false,
        showDeliveryStatus: false,
        showQaStatus: false,
        showMeetingSetDate: !showKstagnitoTimestamp,
        showAppointment: showKstagnitoTimestamp
          ? false
          : isClientViewer
            ? !clientViewerHidesAppointment(campaign.campaign_type)
            : true,
        showLhoFile: showKstagnitoTimestamp
          ? false
          : isClientViewer
            ? clientViewerShowsLhoFile(campaign.campaign_type)
            : true,
        pinMeetingAndLhoColumns: !showKstagnitoTimestamp,
        showCreatedBy: !showKstagnitoTimestamp,
        showCreatedAt: !showKstagnitoTimestamp,
        pagination: { current: leadPage, pageSize: leadPageSize },
      }) as unknown as ColumnsType<LeadRow>
    );

    if (!showKstagnitoTimestamp) {
      return base;
    }

    const timestampCol: ColumnsType<LeadRow>[number] = {
      title: "Capture Timestamp-Date",
      key: "timestamp_date",
      width: 180,
      fixed: "right",
      render: (_: unknown, record: LeadRow) => {
        const iso = getKstagnitoLeadTimestampDate(campaignId, record.id);
        if (!iso) return "—";
        return dayjs(iso).format("MMM D, YYYY · h:mm A");
      },
    };

    // Fixed-right columns must be at the end for Ant Design sticky behavior.
    return [...base, timestampCol];
  })();

  const historyColumns: ColumnsType<CampaignMetricsHistoryRow> = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      width: 110,
    },
    {
      title: "Delivered",
      dataIndex: "total_leads_delivered",
      key: "total_leads_delivered",
      width: 100,
      render: (v: number | null) => v ?? 0,
    },
    {
      title: "Spend",
      dataIndex: "total_campaign_spend",
      key: "total_campaign_spend",
      width: 120,
      render: (v: number | null) => `$${Number(v ?? 0).toLocaleString()}`,
    },
    {
      title: "Deficit",
      dataIndex: "deficit_leads",
      key: "deficit_leads",
      width: 90,
      render: (v: number | null) => v ?? 0,
    },
    {
      title: "Increment/Replace",
      key: "inc_replace",
      width: 140,
      render: (_, r) => `${r.lead_increment ?? 0} / ${r.lead_replace ?? 0}`,
    },
    {
      title: "Channel Split",
      key: "channel_split",
      render: (_, r) => {
        const split = r.channel_split ?? {};
        const tags = Object.entries(split).map(([k, v]) => `${k}:${String(v)}`);
        return tags.length ? tags.join(" · ") : "—";
      },
    },
    {
      title: "Updated By",
      key: "updated_by_user",
      width: 180,
      render: (_, r) => r.updated_by_user?.full_name ?? r.updated_by_user?.email ?? "—",
    },
    {
      title: "Changed",
      key: "changed",
      width: 220,
      render: (_, row, index) => {
        const prev = metricsHistory[index + 1];
        if (!prev) return <Tag color="blue">Initial Snapshot</Tag>;
        const changed: string[] = [];
        if ((row.total_leads_delivered ?? 0) !== (prev.total_leads_delivered ?? 0)) changed.push("Delivered");
        if ((row.total_campaign_spend ?? 0) !== (prev.total_campaign_spend ?? 0)) changed.push("Spend");
        if ((row.deficit_leads ?? 0) !== (prev.deficit_leads ?? 0)) changed.push("Deficit");
        if ((row.lead_increment ?? 0) !== (prev.lead_increment ?? 0)) changed.push("Increment");
        if ((row.lead_replace ?? 0) !== (prev.lead_replace ?? 0)) changed.push("Replace");
        if (JSON.stringify(row.channel_split ?? {}) !== JSON.stringify(prev.channel_split ?? {})) changed.push("Channel Split");
        return changed.length ? (
          <Space size={[4, 4]} wrap>
            {changed.map((c) => (
              <Tag key={c} color="purple">{c}</Tag>
            ))}
          </Space>
        ) : (
          <Tag>None</Tag>
        );
      },
    },
  ];

  const fileColumns: ColumnsType<NonNullable<CampaignDetail["campaign_files"]>[number]> = [
    {
      title: "File name",
      dataIndex: "file_name",
      key: "file_name",
      ellipsis: true,
      render: (name: string) => name || "—",
    },
    {
      title: "Uploaded",
      dataIndex: "created_at",
      key: "created_at",
      width: 170,
      render: (v: string) => (v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "—"),
    },
    {
      title: "Action",
      key: "action",
      width: 130,
      align: "right",
      render: (_, row) =>
        row.download_url ? (
          <Button
            type="link"
            icon={<DownloadOutlined />}
            href={row.download_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Download
          </Button>
        ) : (
          <Text type="secondary">Unavailable</Text>
        ),
    },
  ];

  const tabItems = [
    {
      key: "metrics",
      label: (
        <span>
          <BarChartOutlined /> Metrics
        </span>
      ),
      children: (
        <CampaignLeadMetricsTab
          totalLeads={analytics?.leads.total ?? 0}
          dailyLeads={analytics?.leads.dailyLeads ?? []}
          trends={analytics?.trends}
          campaignDateRange={formatCampaignDateRange(campaign.start_date, campaign.end_date)}
          onRangeChange={(from, to) => setTrendRangeOverride({ from, to })}
          onRangeReset={() => setTrendRangeOverride(null)}
        />
      ),
    },
    {
      key: "average_analysis",
      label: (
        <span>
          <FundProjectionScreenOutlined /> Average Analysis
        </span>
      ),
      children: (
        <CampaignAverageAnalysisTab
          startDate={campaign.start_date}
          endDate={campaign.end_date}
          totalAllocation={allocationNow}
          totalUploaded={totalLeadsKpi}
          dailyLeads={analytics?.leads.dailyLeads ?? []}
          campaignDateRange={formatCampaignDateRange(campaign.start_date, campaign.end_date)}
        />
      ),
    },
    {
      key: "description",
      label: (
        <span>
          <FileOutlined /> Description
        </span>
      ),
      children: (
        <Card size="small" bordered style={{ borderRadius: 10 }}>
          {campaign.description?.trim() ? (
            <>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: 1.6,
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  ...(descriptionExpanded
                    ? {}
                    : {
                        display: "-webkit-box",
                        WebkitLineClamp: 5,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }),
                }}
              >
                {renderDescriptionWithLinks(campaign.description.trim())}
              </div>
              <Button
                type="link"
                size="small"
                style={{ paddingLeft: 0, marginTop: 8, height: "auto" }}
                onClick={() => setDescriptionExpanded((v) => !v)}
              >
                {descriptionExpanded ? "Show Less" : "Show More"}
              </Button>
            </>
          ) : (
            <Text type="secondary">No description provided for this campaign.</Text>
          )}
        </Card>
      ),
    },
    {
      key: "leads",
      label: (
        <span>
          <UnorderedListOutlined /> Leads ({leadsTotal || (analytics?.leads.total ?? 0)})
        </span>
      ),
      children: (
        <div>
          <Card
            size="small"
            title="Filters"
            style={{ marginBottom: 16, borderRadius: 10 }}
            styles={{ body: { padding: "12px 16px" } }}
          >
            <div className="lead-panel-filters-row">
              <div className="lead-panel-filters-row__field lead-panel-filters-row__search">
                <Text type="secondary" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
                  Search
                </Text>
                <Input
                  allowClear
                  placeholder="Lead ID, name, company, email, phone"
                  prefix={<SearchOutlined style={{ color: "#9ca3af" }} />}
                  value={leadSearchDraft}
                  onChange={(e) => setLeadSearchDraft(e.target.value)}
                  onPressEnter={() => {
                    const next = leadSearchDraft.trim();
                    setLeadPanelFilters((p) => ({ ...p, search: next }));
                    setLeadPage(1);
                  }}
                />
              </div>
              <div className="lead-panel-filters-row__field lead-panel-filters-row__channel">
                <Text type="secondary" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
                  Channel
                </Text>
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="All"
                  style={{ width: "100%" }}
                  options={CHANNEL_FILTER_OPTIONS}
                  value={leadPanelFilters.channels}
                  onChange={(v) => setLeadPanelFilters((p) => ({ ...p, channels: v }))}
                  maxTagCount="responsive"
                />
              </div>
              <div className="lead-panel-filters-row__field lead-panel-filters-row__date">
                <Text type="secondary" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
                  Ingestion date
                </Text>
                <RangePicker
                  style={{ width: "100%" }}
                  value={
                    leadPanelFilters.dateFrom && leadPanelFilters.dateTo
                      ? [dayjs(leadPanelFilters.dateFrom), dayjs(leadPanelFilters.dateTo)]
                      : null
                  }
                  onChange={(vals) => {
                    if (!vals?.[0] || !vals[1]) {
                      setLeadPanelFilters((p) => ({ ...p, dateFrom: null, dateTo: null }));
                    } else {
                      setLeadPanelFilters((p) => ({
                        ...p,
                        dateFrom: vals[0]!.format("YYYY-MM-DD"),
                        dateTo: vals[1]!.format("YYYY-MM-DD"),
                      }));
                    }
                  }}
                />
              </div>
              <div className="lead-panel-filters-row__actions">
                <Button
                  onClick={() => {
                    setLeadSearchDraft("");
                    setLeadPanelFilters(defaultLeadPanelFilters());
                  }}
                >
                  Clear filters
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => exportLeadsCsv()}>
                  Export CSV
                </Button>
              </div>
            </div>
          </Card>

          {canBulkSelect && selectedLeadKeys.length > 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={`${selectedLeadKeys.length} lead${selectedLeadKeys.length !== 1 ? "s" : ""} selected`}
              description="Batch operations will be available in a future update."
            />
          )}

          <div style={{ marginBottom: 10 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {leadsTotal} lead{leadsTotal !== 1 ? "s" : ""} match filters
            </Text>
          </div>

          <Table<LeadRow>
            className="table-single-line"
            tableLayout="fixed"
            rowSelection={
              canBulkSelect
                ? {
                    selectedRowKeys: selectedLeadKeys,
                    onChange: (keys) => setSelectedLeadKeys(keys),
                    preserveSelectedRowKeys: true,
                  }
                : undefined
            }
            columns={leadColumns}
            dataSource={leads}
            rowKey="id"
            loading={leadsLoading && leads.length === 0}
            size="small"
            scroll={{ x: "max-content" }}
            pagination={{
              current: leadPage,
              pageSize: leadPageSize,
              total: leadsTotal,
              showSizeChanger: true,
              pageSizeOptions: [25, 50, 100],
              showTotal: (t) => `${t} leads`,
            }}
            onChange={(pag, _filt, sorter) => {
              if (pag.pageSize != null && pag.pageSize !== leadPageSize) {
                setLeadPageSize(pag.pageSize);
                setLeadPage(1);
              } else if (pag.current != null) {
                setLeadPage(pag.current);
              }
              if (Array.isArray(sorter)) return;
              const sortKey = sorter.columnKey ?? sorter.field;
              if (sorter.order && sortKey != null) {
                setLeadSortField(String(sortKey));
                setLeadSortOrder(sorter.order);
                setLeadPage(1);
              }
            }}
            onRow={(row) => ({
              onClick: (e) => {
                const t = e.target as HTMLElement;
                if (t.closest?.("button, a, .ant-checkbox-wrapper, .ant-select")) return;
                setAuditLeadId(row.id);
              },
              style: { cursor: "pointer" },
            })}
          />
        </div>
      ),
    },
    {
      key: "files",
      label: (
        <span>
          <FileOutlined /> Files ({campaign.campaign_files?.length ?? 0})
        </span>
      ),
      children: (
        <Card size="small" bordered style={{ borderRadius: 10 }}>
          <Table
            rowKey="id"
            columns={fileColumns}
            dataSource={campaign.campaign_files ?? []}
            size="small"
            pagination={{ pageSize: 10, showTotal: (t) => `${t} file${t !== 1 ? "s" : ""}` }}
            locale={{ emptyText: "No files uploaded for this campaign yet." }}
          />
        </Card>
      ),
    },
    ...(!isClientViewer
      ? [
          {
            key: "alerts",
            label: (
              <span>
                <AlertOutlined />
                {" "}Alerts
                {openAlerts > 0 && (
                  <Badge
                    count={openAlerts}
                    style={{
                      marginLeft: 8,
                      backgroundColor: criticalAlerts > 0 ? "#ef4444" : "#f59e0b",
                    }}
                  />
                )}
              </span>
            ),
            children: (
              <AlertsPanel campaignId={campaignId} onOpenLeadAudit={(id) => setAuditLeadId(id)} />
            ),
          },
        ]
      : []),
    {
      key: "history",
      label: (
        <span>
          <HistoryOutlined /> History
        </span>
      ),
      children: (
        <Card size="small" bordered style={{ borderRadius: 10 }}>
          <Table
            rowKey="id"
            columns={historyColumns}
            dataSource={metricsHistory}
            loading={historyLoading}
            size="small"
            scroll={{ x: 1200 }}
            pagination={{ pageSize: 15, showTotal: (t) => `${t} updates` }}
          />
        </Card>
      ),
    },
    ...(!isClientViewer
      ? [
          {
            key: "qa",
            label: (
              <span>
                <ExclamationCircleOutlined /> QA
              </span>
            ),
            children: (
              <Card size="small" bordered style={{ borderRadius: 10 }}>
                <QAPanel campaignId={campaignId} onOpenLeadAudit={(id) => setAuditLeadId(id)} />
              </Card>
            ),
          },
        ]
      : []),
  ];

  const TAB_DISPLAY_ORDER = [
    "leads",
    "metrics",
    "average_analysis",
    "description",
    "files",
    "alerts",
    "history",
    "qa",
  ] as const;

  const orderedTabItems = TAB_DISPLAY_ORDER.map((key) =>
    tabItems.find((item) => item.key === key)
  ).filter((item): item is (typeof tabItems)[number] => item != null);

  const kpiCardStyle: CSSProperties = {
    flex: "1 1 160px",
    minWidth: 160,
    borderRadius: 10,
    textAlign: "center",
  };

  if (isFeedView && campaign) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 24px",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => setActiveTab("leads")}
            style={{ paddingLeft: 0 }}
          >
            Back
          </Button>
          <Title level={4} style={{ margin: 0 }}>
            {campaign.name}
          </Title>
          <Tag color="blue" icon={<MessageOutlined />}>
            Campaign Workspace
          </Tag>
        </div>
        <div style={{ padding: "16px 24px 24px" }}>
          <CampaignFeedTab campaignId={campaignId} fullPage variant="full" />
        </div>
        <LeadAuditPanel
          leadId={auditLeadId}
          open={Boolean(auditLeadId)}
          onClose={() => setAuditLeadId(null)}
          onLeadUpdated={() => {
            void fetchData();
          }}
        />
      </div>
    );
  }

  return (
    <div>
      {useClientViewerChrome && clientViewerChrome ? (
        <div
          ref={clientViewerChromeRef}
          style={{
            position: "sticky",
            top: "calc(-1 * var(--app-content-padding, 24px))",
            zIndex: 40,
            marginLeft: -24,
            marginRight: -24,
            marginBottom: 12,
            padding: "8px 24px",
            // Match AppLayout Content — covers scrolled content without a white strip.
            background: "#f5f5f5",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <Button
              icon={<ArrowLeftOutlined />}
              type="text"
              onClick={clientViewerChrome.onBack}
              style={{ paddingLeft: 0 }}
            >
              Campaign Command Center
            </Button>
            {clientViewerChrome.onViewReport ? (
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                onClick={clientViewerChrome.onViewReport}
              >
                View Report
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        ref={useClientViewerChrome ? undefined : stickyHeaderRef}
        style={
          useClientViewerChrome
            ? {
                background: "#fff",
                padding: "16px 24px",
                marginBottom: 0,
                borderRadius: 12,
                border: "1px solid #f0f0f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }
            : {
                position: "sticky",
                // Pull up by dashboard Content padding so no grey strip shows above the bar while scrolling.
                top: "calc(-1 * var(--app-content-padding, 0px))",
                zIndex: 20,
                background: "#fff",
                padding: "16px 24px",
                marginBottom: 16,
                borderBottom: "1px solid #f0f0f0",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                borderRadius: "12px 12px 0 0",
                transform: "translate3d(0, 0, 0)",
                transition:
                  "transform 0.22s ease, box-shadow 0.22s ease, border-bottom-color 0.22s ease",
                willChange: "transform",
                backfaceVisibility: "hidden",
              }
        }
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Title level={4} style={{ margin: 0 }}>
                {campaign.name}
              </Title>
              {headerCode ? (
                <Tag
                  color={headerCode.isStructuredCode ? "blue" : "default"}
                  style={{ fontFamily: "monospace" }}
                >
                  {headerCode.text}
                </Tag>
              ) : null}
              <Tag
                color={
                  campaign.status === "active" ? "green" :
                  campaign.status === "paused" ? "orange" :
                  campaign.status === "completed" ? "green" : "default"
                }
              >
                {campaign.status.toUpperCase()}
              </Tag>
            </div>
            <div style={{ marginTop: 10 }}>
              <Space
                wrap
                size={[20, 12]}
                split={
                  <Divider
                    type="vertical"
                    style={{ margin: 0, height: 44, borderColor: "#f0f0f0" }}
                  />
                }
              >
                <div style={{ minWidth: 120, maxWidth: 280 }}>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      display: "block",
                    }}
                  >
                    Sponsor name
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 600, display: "block", marginTop: 4 }}>
                    {metrics?.sponsor_name?.trim() || "—"}
                  </Text>
                </div>
                {!(
                  isKstagnitoViewer &&
                  (campaign.client_name ?? "").trim().toLowerCase() === "7 knots digital inc"
                ) && (
                <div style={{ minWidth: 120, maxWidth: 280 }}>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      display: "block",
                    }}
                  >
                    Client
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 600, display: "block", marginTop: 4 }}>
                    {campaign.client_name?.trim() || "—"}
                  </Text>
                </div>
                )}
                <div style={{ minWidth: 120, maxWidth: 280 }}>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      display: "block",
                    }}
                  >
                    Campaign type
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 600, display: "block", marginTop: 4 }}>
                    {campaign.campaign_type?.trim() || "—"}
                  </Text>
                </div>
                <div style={{ minWidth: 120, maxWidth: 280 }}>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      display: "block",
                    }}
                  >
                    Aggregate name
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 600, display: "block", marginTop: 4 }}>
                    {campaign.lead_aggregated?.trim() || "—"}
                  </Text>
                </div>
                <div style={{ minWidth: 120, maxWidth: 280 }}>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      display: "block",
                    }}
                  >
                    Lead type
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 600, display: "block", marginTop: 4 }}>
                    {campaign.lead_type?.trim() || "—"}
                  </Text>
                </div>
                <div style={{ minWidth: 160, maxWidth: 320 }}>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      display: "block",
                    }}
                  >
                    Industry / Geography
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 600, display: "block", marginTop: 4 }}>
                    {[campaign.industry, campaign.geography].filter(Boolean).join(" / ") || "—"}
                  </Text>
                </div>
                <div style={{ minWidth: 180, maxWidth: 360 }}>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      display: "block",
                    }}
                  >
                    Revenue Size
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 600, display: "block", marginTop: 4 }}>
                    {campaign.revenue_size?.length ? campaign.revenue_size.join(", ") : "—"}
                  </Text>
                </div>
                <div style={{ minWidth: 200, maxWidth: 360 }}>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      display: "block",
                    }}
                  >
                    Campaign dates
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 600, display: "block", marginTop: 4 }}>
                    {formatCampaignDateRange(campaign.start_date, campaign.end_date)}
                  </Text>
                </div>
                <div style={{ minWidth: 120, maxWidth: 240 }}>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      display: "block",
                    }}
                  >
                    CPL / Revenue
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 600, display: "block", marginTop: 4 }}>
                    {(campaign.cpl ?? null) != null
                      ? `$${Number(campaign.cpl).toLocaleString()}`
                      : "—"}
                    {" / "}
                    {formatEarnedRevenue(campaign.cpl, campaign.achieved)}
                  </Text>
                </div>
              </Space>
            </div>
          </div>

          <Space>
            {!isClientViewer && criticalAlerts > 0 && (
              <Tag color="red" icon={<AlertOutlined />}>
                {criticalAlerts} CRITICAL
              </Tag>
            )}
            <Button size="small" onClick={() => void fetchData()}>
              Refresh
            </Button>
          </Space>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
          <Card size="small" bordered styles={{ body: { padding: "14px 16px" } }} style={kpiCardStyle}>
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
              Total Leads
            </Text>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, color: "#262626" }}>
              {totalLeadsKpi}
            </div>
          </Card>

          {!isAgCampaignType(campaign.campaign_type) && (
            <Card size="small" bordered styles={{ body: { padding: "14px 16px" } }} style={kpiCardStyle}>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                Channel Split
              </Text>
              <ChannelSplitMiniBar email={emailLeads} tele={teleLeads} />
            </Card>
          )}

          {!isClientViewer && (
            <Card
              size="small"
              bordered
              hoverable
              role="button"
              tabIndex={0}
              onClick={() => setActiveTab("alerts")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveTab("alerts");
                }
              }}
              styles={{ body: { padding: "14px 16px" } }}
              style={{
                ...kpiCardStyle,
                cursor: "pointer",
                borderColor: openAlerts > 0 ? "#ffccc7" : undefined,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Alerts
                </Text>
                {openAlerts > 0 && (
                  <Badge count={openAlerts} style={{ backgroundColor: "#ef4444" }} />
                )}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: openAlerts > 0 ? "#ef4444" : "#262626",
                }}
              >
                {openAlerts}
              </div>
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
                {criticalAlerts > 0
                  ? `${criticalAlerts} critical`
                  : openAlerts === 0
                    ? "No open alerts"
                    : "Tap to review"}
              </Text>
            </Card>
          )}

          <Card size="small" bordered styles={{ body: { padding: "14px 16px" } }} style={kpiCardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>
                Total Allocation
              </Text>
              {canAdjustAllocation && (
                <Space size={6}>
                  <Tooltip title="Decrease allocation by 1">
                    <Button
                      type="primary"
                      size="small"
                      shape="circle"
                      icon={<MinusOutlined />}
                      loading={allocationSaving}
                      disabled={allocationNow <= 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        void adjustAllocation(-1);
                      }}
                      style={{
                        minWidth: 28,
                        width: 28,
                        height: 28,
                        padding: 0,
                        background: "#ef4444",
                        borderColor: "#ef4444",
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="Increase allocation by 1">
                    <Button
                      type="primary"
                      size="small"
                      shape="circle"
                      icon={<PlusOutlined />}
                      loading={allocationSaving}
                      onClick={(e) => {
                        e.stopPropagation();
                        void adjustAllocation(1);
                      }}
                      style={{
                        minWidth: 28,
                        width: 28,
                        height: 28,
                        padding: 0,
                        background: "#52c41a",
                        borderColor: "#389e0d",
                      }}
                    />
                  </Tooltip>
                </Space>
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                flexWrap: "wrap",
                gap: 8,
                rowGap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: "#52c41a",
                }}
              >
                {allocationNow.toLocaleString()}
              </span>
              {allocationNow > 0 && (() => {
                const filledPct = Math.min(
                  100,
                  Math.round((totalLeadsKpi / allocationNow) * 1000) / 10
                );
                const tone =
                  filledPct >= 100
                    ? { color: "#389e0d", bg: "#f6ffed", border: "#b7eb8f" }
                    : filledPct >= 60
                      ? { color: "#4f46e5", bg: "#eef2ff", border: "#c7d2fe" }
                      : { color: "#b91c1c", bg: "#fff2e8", border: "#ffbb96" };
                return (
                  <Tooltip title={`${totalLeadsKpi.toLocaleString()} of ${allocationNow.toLocaleString()} leads delivered`}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: tone.color,
                        background: tone.bg,
                        border: `1px solid ${tone.border}`,
                        padding: "2px 8px",
                        borderRadius: 999,
                        lineHeight: 1.4,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {filledPct}% filled
                    </span>
                  </Tooltip>
                );
              })()}
              {allocationDelta !== 0 && (
                <Tooltip
                  title={`Allocation changed by ${allocationDelta > 0 ? "+" : ""}${allocationDelta} this session`}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: allocationDelta > 0 ? "#389e0d" : "#ef4444",
                      background: allocationDelta > 0 ? "#f6ffed" : "#fff1f0",
                      border: `1px solid ${allocationDelta > 0 ? "#b7eb8f" : "#ffa39e"}`,
                      padding: "2px 8px",
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 2,
                      lineHeight: 1.4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {allocationDelta > 0 ? (
                      <CaretUpOutlined style={{ fontSize: 11 }} />
                    ) : (
                      <CaretDownOutlined style={{ fontSize: 11 }} />
                    )}
                    {allocationTrendPct}%
                  </span>
                </Tooltip>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
              Lead quota (campaign)
            </Text>
          </Card>

          <Card size="small" bordered styles={{ body: { padding: "14px 16px" } }} style={kpiCardStyle}>
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
              Deficit leads
            </Text>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, color: "#262626" }}>
              {deficitLeadsKpi.toLocaleString()}
            </div>
          </Card>
        </div>
      </div>

      <div style={{ padding: useClientViewerChrome ? "0 0 24px" : "0 24px 24px" }}>
        {useClientViewerChrome ? (
          <>
            <div
              style={{
                position: "sticky",
                top: "calc(-1 * var(--app-content-padding, 24px) + var(--cv-campaign-toolbar-h, 48px))",
                zIndex: 35,
                marginLeft: -24,
                marginRight: -24,
                marginTop: 12,
                padding: "8px 24px 0",
                background: "#f5f5f5",
              }}
              role="tablist"
              aria-label="Campaign sections"
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  borderBottom: "1px solid #e8e8e8",
                }}
              >
                {orderedTabItems.map((item) => {
                  const selected = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveTab(item.key)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: -1,
                        border: selected ? "1px solid #e8e8e8" : "1px solid transparent",
                        borderBottom: selected ? "1px solid #f5f5f5" : "1px solid transparent",
                        background: selected ? "#fff" : "transparent",
                        color: selected ? "#1677ff" : "rgba(0,0,0,0.65)",
                        borderRadius: "8px 8px 0 0",
                        padding: "8px 14px",
                        fontSize: 13,
                        fontWeight: selected ? 600 : 500,
                        cursor: "pointer",
                        lineHeight: 1.3,
                        transition:
                          "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              style={{
                background: "#fff",
                border: "1px solid #f0f0f0",
                borderTop: "none",
                borderRadius: "0 0 12px 12px",
                padding: 16,
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              {orderedTabItems.find((item) => item.key === activeTab)?.children ?? null}
            </div>
          </>
        ) : (
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={orderedTabItems}
            size="small"
            type="card"
          />
        )}
      </div>

      <LeadAuditPanel
        leadId={auditLeadId}
        open={Boolean(auditLeadId)}
        onClose={() => setAuditLeadId(null)}
        onLeadUpdated={() => {
          void fetchData();
          if (activeTab === "leads") void fetchLeads();
        }}
      />

      {showFeedTab && campaign && !isFeedView && (
        <CampaignFeedChatWidget
          campaignId={campaignId}
          campaignName={campaign.name}
          unreadCount={unreadCount}
          open={feedChatOpen}
          onOpenChange={setFeedChatOpen}
          onExpand={() => setActiveTab("feed")}
        />
      )}
    </div>
  );
}
