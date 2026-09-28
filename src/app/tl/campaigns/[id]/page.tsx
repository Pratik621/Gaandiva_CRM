"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  Button,
  Table,
  Tag,
  Modal,
  Transfer,
  Input,
  message,
  Spin,
  Typography,
  Empty,
  Row,
  Col,
  Divider,
  Space,
  Drawer,
  Form,
  Upload,
  DatePicker,
  Badge,
  Tooltip,
  Select,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  PAGINATION_SYNC_TOTAL_ONLY,
  useServerTablePagination,
} from "@/hooks/useServerTablePagination";
import { buildListApiUrl } from "@/lib/build-list-api-url";
import {
  ArrowLeftOutlined,
  UserAddOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  TeamOutlined,
  FileOutlined,
  DownloadOutlined,
  UploadOutlined,
  InboxOutlined,
  MessageOutlined,
  DownOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import CampaignFeedTab from "@/components/command/CampaignFeedTab";
import { hasCampaignFeedRole } from "@/lib/command/campaign-feed-access";
import { CampaignFeedChatWidget } from "@/components/command/CampaignFeedChatWidget";
import { useCampaignFeedUnread } from "@/hooks/useCampaignFeedUnread";
import { downloadExcel } from "@/lib/leadsExport";
import { parseLeadsCsv, parseLeadsExcel } from "@/lib/leadsImport";
import { getLeadTableColumns } from "@/components/Leads/LeadTableColumns";
import { LeadDrawerContent, LEAD_DRAWER_WIDTH, LEAD_DRAWER_BODY_STYLE } from "@/components/Leads/LeadDrawerContent";
import { buildLeadPayload, leadToFormValues } from "@/lib/leadPayload";
import type { Lead } from "@/types/lead.types";
import { ExpandableText, renderExpandableOverviewValue } from "@/components/ExpandableText";
import { campaignHeaderDisplayCode } from "@/lib/campaign-display";
import { normalizeCampaignQuestions } from "@/lib/campaign-questions";
import { CampaignDetailsCard } from "@/components/Campaigns/CampaignDetailsCard";

type Campaign = {
  id: string;
  campaign_id?: string | null;
  campaign_code?: string | null;
  name: string;
  client_name?: string | null;
  description: string | null;
  industry: string | null;
  geography: string | null;
  target_designation?: string | null;
  lead_type?: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  cpl?: number | null;
  revenue?: number | null;
  booked?: number | null;
  total_allocation?: number | null;
  post_qa?: number | null;
  achieved?: number | null;
  pending_allocation?: number | null;
  weekly_call?: string | null;
  weekly_report?: string | null;
  additional_comments?: string | null;
  assigned_team_leader_id?: string | null;
  assigned_team_leader_name?: string | null;
  team_leader_assignments?: TeamLeaderAssignment[];
  employee_size?: string[] | null;
  revenue_size?: string[] | null;
  abm?: boolean | null;
  seniority?: string | null;
  job_function?: string | null;
  creatives_url?: string[] | null;
  created_at?: string;
  campaign_questions?: unknown;
};

type Agent = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type TeamLeaderAssignment = {
  team_leader_id: string;
  team_leader_name: string | null;
};

type CampaignFile = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  download_url: string | null;
};

type MoveCampaign = {
  id: string;
  name: string;
  campaign_code?: string | null;
  campaign_id?: string | null;
};

type CampaignLog = {
  id: string;
  action: string;
  message: string;
  created_by: string;
  created_at: string;
};



export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const { hasRole, hasTLAccess, isInitialized, roles } = useAuth();
  const isOperationsManager = hasRole("operations_manager");
  const showFeedTab = hasCampaignFeedRole(
    roles.map((r) => (typeof r === "string" ? r : (r.role_name ?? r.name ?? "")))
  );
  const isTeamLeader = roles?.some(({ role_name }) => role_name === "Team Leader");
  const [viewTab, setViewTab] = useState("details");
  const [feedChatOpen, setFeedChatOpen] = useState(true);
  const isFeedView = showFeedTab && viewTab === "feed";
  const { unreadCount, markRead } = useCampaignFeedUnread({
    campaignId: id ?? "",
    enabled: showFeedTab && Boolean(id),
    paused: isFeedView || feedChatOpen,
  });

  useEffect(() => {
    if (isFeedView || feedChatOpen) void markRead();
  }, [isFeedView, feedChatOpen, markRead]);
  const canEditQaAudit = hasRole("qa") || hasRole("admin");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [assignments, setAssignments] = useState<{ agent_id: string; agent_name?: string }[]>([]);
  const [teamLeaderAssignments, setTeamLeaderAssignments] = useState<TeamLeaderAssignment[]>([]);
  const [files, setFiles] = useState<CampaignFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTlModalOpen, setAssignTlModalOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [teamLeaders, setTeamLeaders] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [teamLeadersLoading, setTeamLeadersLoading] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [selectedTeamLeaderIds, setSelectedTeamLeaderIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assigningTl, setAssigningTl] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [updatingLead, setUpdatingLead] = useState(false);
  const [form] = Form.useForm();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<Record<string, unknown>[]>([]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const { page, pageSize, total, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination();

const [selectedLeadIds, setSelectedLeadIds] = useState<React.Key[]>([]);
const [moveModalOpen, setMoveModalOpen] = useState(false);
const [moveCampaigns, setMoveCampaigns] = useState<MoveCampaign[]>([]);
const [moveCampaignId, setMoveCampaignId] = useState<string | null>(null);
const [moveCampaignsLoading, setMoveCampaignsLoading] = useState(false);
const [movingLeads, setMovingLeads] = useState(false);
const [campaignLogs, setCampaignLogs] = useState<CampaignLog[]>([]);
const [logsLoading, setLogsLoading] = useState(false);
const [isAgentsCollapsed, setIsAgentsCollapsed] = useState(true);

  const assignQueryHandledRef = useRef(false);
  const initialLeadsLoadDoneRef = useRef(false);
  const routerRef = useRef(router);
  routerRef.current = router;

  const assignedAgentCount = assignments.length;
  const assignedAgentNames = useMemo(
    () =>
      assignments
        .map((a) => a.agent_name?.trim() || null)
        .filter((name): name is string => Boolean(name)),
    [assignments]
  );
  const assignedAgentTooltip =
    assignedAgentCount > 0
      ? assignedAgentNames.length > 0
        ? assignedAgentNames.join(", ")
        : `${assignedAgentCount} agent${assignedAgentCount === 1 ? "" : "s"} assigned`
      : "No agents assigned yet";

  const effectiveTeamLeaderAssignments = useMemo(() => {
    const byId = new Map<string, TeamLeaderAssignment>();
    for (const row of teamLeaderAssignments) {
      if (row.team_leader_id) byId.set(row.team_leader_id, row);
    }
    for (const row of campaign?.team_leader_assignments ?? []) {
      if (row.team_leader_id && !byId.has(row.team_leader_id)) {
        byId.set(row.team_leader_id, row);
      }
    }
    if (campaign?.assigned_team_leader_id && !byId.has(campaign.assigned_team_leader_id)) {
      byId.set(campaign.assigned_team_leader_id, {
        team_leader_id: campaign.assigned_team_leader_id,
        team_leader_name: campaign.assigned_team_leader_name ?? null,
      });
    }
    return [...byId.values()];
  }, [teamLeaderAssignments, campaign]);

  const assignedTlCount = effectiveTeamLeaderAssignments.length;
  const campaignQuestions = useMemo(
    () => normalizeCampaignQuestions(campaign?.campaign_questions),
    [campaign?.campaign_questions]
  );

  const assignedTlNames = useMemo(
    () =>
      effectiveTeamLeaderAssignments
        .map((a) => a.team_leader_name?.trim() || null)
        .filter((name): name is string => Boolean(name)),
    [effectiveTeamLeaderAssignments]
  );
  const assignedTlTooltip =
    assignedTlCount > 0
      ? assignedTlNames.length > 0
        ? assignedTlNames.join(", ")
        : `${assignedTlCount} team leader${assignedTlCount === 1 ? "" : "s"} assigned`
      : "No team leaders assigned yet";

  const fetchCampaign = useCallback(async (id: string) => {
    const silent = initialLeadsLoadDoneRef.current;
    initialLeadsLoadDoneRef.current = true;
    if (!silent) setLoading(true);
    try {
      const url = buildListApiUrl(`/api/tl/campaigns/${id}`, {
        page,
        limit: pageSize,
        q: leadSearch.trim() || undefined,
        date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
        date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
      });
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setCampaign(data.campaign);
      setLeads(data.leads ?? []);
      applyPaginationMeta(data.leads_pagination, PAGINATION_SYNC_TOTAL_ONLY);
      setAssignments(data.assignments ?? []);
      const tlRows =
        data.team_leader_assignments ??
        data.campaign?.team_leader_assignments ??
        [];
      const legacyId = data.campaign?.assigned_team_leader_id as string | null | undefined;
      const legacyName = data.campaign?.assigned_team_leader_name as string | null | undefined;
      if (legacyId && !tlRows.some((r: TeamLeaderAssignment) => r.team_leader_id === legacyId)) {
        setTeamLeaderAssignments([
          ...tlRows,
          { team_leader_id: legacyId, team_leader_name: legacyName ?? null },
        ]);
      } else {
        setTeamLeaderAssignments(tlRows);
      }
      setFiles(data.files ?? []);
      setCampaignId(id);
    } catch {
      message.error("Failed to load campaign");
      routerRef.current.replace("/tl/dashboard");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, pageSize, applyPaginationMeta, leadSearch, dateRange]);

  useEffect(() => {
    if (!id) {
      router.replace("/tl/dashboard");
      return;
    }
    if (!isInitialized) return;
    if (!hasTLAccess()) {
      router.replace("/login");
      return;
    }
    fetchCampaign(id);
  }, [id, isInitialized, hasTLAccess, router, fetchCampaign]);

  useEffect(() => {
    assignQueryHandledRef.current = false;
    initialLeadsLoadDoneRef.current = false;
    resetPage();
  }, [id, resetPage]);

  useEffect(() => {
    if (!campaignId || assignQueryHandledRef.current) return;

    const openAssignTl = searchParams.get("assignTl") === "1" && isOperationsManager;
    const openAssignAgents = searchParams.get("assign") === "1" && !isOperationsManager;

    if (!openAssignTl && !openAssignAgents) return;

    assignQueryHandledRef.current = true;
    if (openAssignTl) setAssignTlModalOpen(true);
    if (openAssignAgents) setAssignModalOpen(true);
    router.replace(`/tl/campaigns/${campaignId}`, { scroll: false });
  }, [searchParams, campaignId, isOperationsManager, router]);

  useEffect(() => {
    if (assignTlModalOpen) {
      setSelectedTeamLeaderIds(effectiveTeamLeaderAssignments.map((a) => a.team_leader_id));
      setTeamLeadersLoading(true);
      fetch("/api/tl/team-leaders", { credentials: "include" })
        .then((res) => res.json())
        .then((data) => {
          setTeamLeaders(data.team_leaders ?? []);
          if (data.error) message.warning(data.error);
        })
        .catch(() => message.error("Failed to load team leaders"))
        .finally(() => setTeamLeadersLoading(false));
    }
  }, [assignTlModalOpen, effectiveTeamLeaderAssignments]);

const fetchCampaignLogs = useCallback(async (campaignId: string) => {
  setLogsLoading(true);
  try {
    const res = await fetch(`/api/tl/campaigns/${campaignId}/logs`, { credentials: "include" });
    const data = await res.json();
    if (res.ok) setCampaignLogs(data.logs ?? []);
  } catch (err) {
    console.error("Failed to load campaign logs:", err);
  } finally {
    setLogsLoading(false);
  }
}, []);

useEffect(() => {
  if (id) void fetchCampaignLogs(id);
}, [id, fetchCampaignLogs]);


  useEffect(() => {
    if (assignModalOpen && !isOperationsManager) {
      setSelectedAgentIds(assignments.map((a) => a.agent_id));
      setAgentsLoading(true);
      fetch("/api/tl/agents", { credentials: "include" })
        .then((res) => res.json())
        .then((data) => {
          setAgents(data.agents ?? []);
          if (data.error) message.warning(data.error);
        })
        .catch(() => message.error("Failed to load agents"))
        .finally(() => setAgentsLoading(false));
    }
  }, [assignModalOpen, assignments, isOperationsManager]);

  const openAssignModal = () => setAssignModalOpen(true);
  const openAssignTlModal = () => setAssignTlModalOpen(true);

  const handleAssignTeamLeaders = async () => {
    if (!campaignId) return;
    setAssigningTl(true);
    try {
      const res = await fetch(`/api/tl/campaigns/${campaignId}/assign-team-leaders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ team_leader_ids: selectedTeamLeaderIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      message.success(
        selectedTeamLeaderIds.length > 0
          ? `${selectedTeamLeaderIds.length} team leader${selectedTeamLeaderIds.length === 1 ? "" : "s"} assigned`
          : "Team leaders removed"
      );
      setAssignTlModalOpen(false);
      void fetchCampaign(campaignId);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to assign Team Leaders");
    } finally {
      setAssigningTl(false);
    }
  };

  const tlTransferData = useMemo(
    () =>
      teamLeaders.map((tl) => ({
        key: tl.id,
        title: tl.full_name || tl.email || "Unknown",
        description: tl.email || "",
      })),
    [teamLeaders]
  );

  const transferData = useMemo(
    () =>
      agents.map((a) => ({
        key: a.id,
        title: a.full_name || a.email || "Unknown",
        description: a.email || "",
      })),
    [agents]
  );

  const handleAssign = async () => {
    if (!campaignId) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/tl/campaigns/${campaignId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agent_ids: selectedAgentIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      message.success("Agents assigned");
      setAssignModalOpen(false);
      fetchCampaign(campaignId);
    } catch {
      message.error("Failed to assign agents");
    } finally {
      setAssigning(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/tl/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      message.success("Campaign updated");
      fetchCampaign(campaignId);
      void fetchCampaignLogs(campaignId);
    } catch {
      message.error("Failed to update campaign");
    }
  };

  const openEditLeadDrawer = (lead: Lead) => {
    setEditingLead(lead);
    form.setFieldsValue(leadToFormValues(lead as unknown as Record<string, unknown>));
    setLeadDrawerOpen(true);
  };

  const closeLeadDrawer = () => {
    setLeadDrawerOpen(false);
    setEditingLead(null);
    form.resetFields();
  };

  const handleUpdateLead = async () => {
    if (!campaignId || !editingLead) return;
    try {
      const values = await form.validateFields();
      setUpdatingLead(true);
      const payload = { ...buildLeadPayload(values), id: editingLead.id };
      const res = await fetch(`/api/tl/campaigns/${campaignId}/leads`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update lead");
      message.success("Lead updated");
      fetchCampaign(campaignId);
      closeLeadDrawer();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to update lead");
    } finally {
      setUpdatingLead(false);
    }
  };

  const hasActiveLeadFilters = Boolean(
    leadSearch.trim() || (dateRange?.[0] && dateRange?.[1])
  );

  const handleExport = async () => {
    if (!campaignId) return;
    if (total === 0) {
      message.warning(
        hasActiveLeadFilters ? "No leads match the current filters to export" : "No leads to export"
      );
      return;
    }
    setExporting(true);
    try {
      const url = buildListApiUrl(`/api/tl/campaigns/${campaignId}`, {
        export: "all",
        q: leadSearch.trim() || undefined,
        date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
        date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
      });
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load leads for export");
      const exportLeads = (data.leads ?? []) as Lead[];
      if (exportLeads.length === 0) {
        message.warning("No leads to export");
        return;
      }
      downloadExcel(
        exportLeads,
        `leads-${campaign?.name?.replace(/\s+/g, "-") ?? "export"}-${dayjs().format("YYYY-MM-DD")}.xlsx`,
        campaign?.name,
        campaign?.lead_type,
        campaign?.assigned_team_leader_name
      );
      message.success(`Exported ${exportLeads.length} leads`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to export leads");
    } finally {
      setExporting(false);
    }
  };

  const handleUploadFile = (file: File) => {
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith(".csv");
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
    if (!isCsv && !isExcel) {
      message.error("Please upload a CSV or Excel (.xlsx) file");
      return false;
    }
    if (isCsv) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = (e.target?.result as string) ?? "";
          const leads = parseLeadsCsv(text);
          setParsedLeads(leads);
          setUploadFile(file);
        } catch {
          message.error("Failed to parse CSV");
        }
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          if (!buffer) {
            message.error("Failed to read file");
            return;
          }
          const leads = parseLeadsExcel(buffer);
          setParsedLeads(leads);
          setUploadFile(file);
        } catch {
          message.error("Failed to parse Excel file");
        }
      };
      reader.readAsArrayBuffer(file);
    }
    return false;
  };

  const handleImport = async () => {
    if (!campaignId || parsedLeads.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/tl/campaigns/${campaignId}/leads/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leads: parsedLeads }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      const created = data.created ?? 0;
      const updated = data.updated ?? 0;
      const total = data.total ?? created + updated;
      message.success(`Processed ${total} leads (${created} new, ${updated} updated)`);
      if (data.errors?.length) {
        message.warning(data.errors.slice(0, 3).join("; ") + (data.errors.length > 3 ? "..." : ""));
      }
      setUploadModalOpen(false);
      setUploadFile(null);
      setParsedLeads([]);
      fetchCampaign(campaignId);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const openMoveModal = async () => {
  if (selectedLeadIds.length === 0) {
    message.warning("Please select at least one lead");
    return;
  }
  setMoveModalOpen(true);
  setMoveCampaignId(null);
  setMoveCampaignsLoading(true);
  try {
    const res = await fetch("/api/tl/campaigns", {
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to load campaigns");
    }

    const campaigns = (data.campaigns ?? [])
      .filter((item: MoveCampaign) => item.id !== campaignId)
      .map((item: MoveCampaign) => ({
        id: item.id,
        name: item.name,
        campaign_code: item.campaign_code,
        campaign_id: item.campaign_id,
      }));

    setMoveCampaigns(campaigns);
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : "Failed to load campaigns"
    );
  } finally {
    setMoveCampaignsLoading(false);
  }
};

const handleMoveLeads = async () => {
  if (!campaignId || !moveCampaignId) {
    message.warning("Please select a campaign");
    return;
  }

  if (selectedLeadIds.length === 0) {
    message.warning("Please select at least one lead");
    return;
  }

  setMovingLeads(true);

  try {
    const res = await fetch(
      `/api/tl/campaigns/${campaignId}/leads/move`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          lead_ids: selectedLeadIds,
          target_campaign_id: moveCampaignId,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to move leads");
    }

    message.success(
      `${selectedLeadIds.length} lead${
        selectedLeadIds.length === 1 ? "" : "s"
      } moved successfully`
    );

    setMoveModalOpen(false);
    setMoveCampaignId(null);
    setSelectedLeadIds([]);

    await fetchCampaign(campaignId);
    void fetchCampaignLogs(campaignId);
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : "Failed to move leads"
    );
  } finally {
    setMovingLeads(false);
  }
};

  useEffect(() => {
    resetPage();
  }, [leadSearch, dateRange, resetPage]);

  useEffect(() => {
    const tab = searchParams.get("tab")?.toLowerCase();
    if (tab === "feed" && showFeedTab) {
      setViewTab("feed");
      setFeedChatOpen(false);
    }
  }, [searchParams, showFeedTab]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  if (loading && !campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  if (!campaign) return null;

  const statusColors: Record<string, string> = {
    draft: "default",
    active: "green",
    paused: "orange",
    completed: "success",
  };

  const leadColumns = getLeadTableColumns({
    showActions: true,
    onEdit: openEditLeadDrawer,
    pagination: { current: page, pageSize },
    showDeliveryStatus: true,
  });

  const overviewRowStyle = {
    display: "grid",
    gridTemplateColumns: "160px 1fr",
    gap: 16,
    padding: "10px 0",
    borderBottom: "1px solid #f0f0f0",
    alignItems: "start",
  } as const;
  const overviewLabelStyle = { fontSize: 13, color: "#6b7280", fontWeight: 500 } as const;
  const overviewValueStyle = { fontSize: 14, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const };

  const OverviewRow = ({ label, value }: { label: string; value: React.ReactNode }) => {
    if (value == null || value === "") return null;
    return (
      <div style={overviewRowStyle}>
        <span style={overviewLabelStyle}>{label}</span>
        <span style={overviewValueStyle}>{renderExpandableOverviewValue(value, overviewValueStyle)}</span>
      </div>
    );
  };
  const OverviewRowOrEmpty = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={overviewRowStyle}>
      <span style={overviewLabelStyle}>{label}</span>
      <span style={overviewValueStyle}>
        {renderExpandableOverviewValue(value ?? "—", overviewValueStyle)}
      </span>
    </div>
  );

  const headerCode = campaignHeaderDisplayCode(campaign);

  return (
    <div style={{ width: "100%", padding: "0 24px 32px" }}>
      {showFeedTab && viewTab === "feed" ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => setViewTab("details")}
              style={{ paddingLeft: 0 }}
            >
              Back
            </Button>
            <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>
              {campaign.name}
            </Typography.Title>
            <Tag color="blue" icon={<MessageOutlined />}>
              Campaign Workspace
            </Tag>
          </div>
          {id && <CampaignFeedTab campaignId={id} fullPage variant="full" />}
        </>
      ) : (
        <>
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/tl/campaigns"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "#4f46e5", textDecoration: "none", marginBottom: 16 }}
        >
          <ArrowLeftOutlined /> Back to Campaigns
        </Link>
      </div>

      <Card
        style={{ marginBottom: 24, borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
        bodyStyle={{ padding: "24px 28px" }}
      >
        <Row gutter={24} align="middle" justify="space-between" wrap>
          <Col flex="1" style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 6,
              }}
            >
              <Typography.Title level={3} style={{ margin: 0, fontWeight: 600 }}>
                {campaign.name}
              </Typography.Title>
            </div>
            <Space size="small" wrap>
              {headerCode && (
                <Tag
                  color={headerCode.isStructuredCode ? "blue" : undefined}
                  style={{ fontFamily: "monospace", fontSize: 12, margin: 0 }}
                >
                  {headerCode.text}
                </Tag>
              )}
              <Tag color={statusColors[campaign.status] ?? "default"} style={{ textTransform: "capitalize", margin: 0 }}>
                {campaign.status}
              </Tag>
              {campaign.lead_type && <Tag style={{ margin: 0 }}>{campaign.lead_type}</Tag>}
              {isOperationsManager && assignedTlCount > 0 && (
                <Tooltip title={assignedTlTooltip}>
                  <Tag color="purple" icon={<TeamOutlined />} style={{ margin: 0 }}>
                    {assignedTlCount} team leader{assignedTlCount === 1 ? "" : "s"} assigned
                  </Tag>
                </Tooltip>
              )}
              {isOperationsManager && assignedTlCount === 0 && (
                <Tag style={{ margin: 0 }}>No Team Leader assigned</Tag>
              )}
              {!isOperationsManager && assignedAgentCount > 0 && (
                <Tooltip title={assignedAgentTooltip}>
                  <Tag color="blue" icon={<TeamOutlined />} style={{ margin: 0 }}>
                    {assignedAgentCount} agent{assignedAgentCount === 1 ? "" : "s"} assigned
                  </Tag>
                </Tooltip>
              )}
              {(campaign.industry || campaign.geography) && (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {[campaign.industry, campaign.geography].filter(Boolean).join(" · ")}
                </Typography.Text>
              )}
            </Space>
          </Col>
          <Col>
            <Space size="small" wrap>
              {isOperationsManager ? (
                <Tooltip title={assignedTlTooltip}>
                  <Badge
                    count={assignedTlCount}
                    showZero={false}
                    size="small"
                    overflowCount={99}
                    offset={[-6, 6]}
                    style={{ backgroundColor: "#722ed1" }}
                  >
                    <Button icon={<UserAddOutlined />} onClick={openAssignTlModal}>
                      {assignedTlCount > 0 ? "Manage Team Leaders" : "Assign Team Leader"}
                    </Button>
                  </Badge>
                </Tooltip>
              ) : (
                <Tooltip title={assignedAgentTooltip}>
                  <Badge
                    count={assignedAgentCount}
                    showZero={false}
                    size="small"
                    overflowCount={99}
                    offset={[-6, 6]}
                    style={{ backgroundColor: "#4f46e5" }}
                  >
                    <Button icon={<UserAddOutlined />} onClick={openAssignModal}>
                      {assignedAgentCount > 0 ? "Manage Agents" : "Assign Agents"}
                    </Button>
                  </Badge>
                </Tooltip>
              )}
              {(campaign.status === "draft" || campaign.status === "paused") && (
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => handleStatusChange("active")}>
                  Activate
                </Button>
              )}
              {campaign.status === "active" && (
                <Button icon={<PauseCircleOutlined />} onClick={() => handleStatusChange("paused")}>
                  Pause
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Card
            title="Overview"
            style={{ marginBottom: 24, borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
            bodyStyle={{ padding: "24px 28px" }}
          >
            {(campaign.description || campaign.target_designation) && (
              <div style={{ marginBottom: 20 }}>
                {campaign.description && <OverviewRow label="Description" value={campaign.description} />}
                {campaign.target_designation && <OverviewRow label="Target Designation" value={campaign.target_designation} />}
              </div>
            )}
            {(campaign.employee_size?.length || campaign.revenue_size?.length || campaign.industry || campaign.abm != null || campaign.seniority || campaign.job_function || campaign.creatives_url?.length) ? (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Targeting</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0 32px" }}>
                  <div>
                    <OverviewRowOrEmpty label="Employee Size" value={campaign.employee_size?.length ? campaign.employee_size.join(", ") : null} />
                    <OverviewRowOrEmpty label="Revenue Size" value={campaign.revenue_size?.length ? campaign.revenue_size.join(", ") : null} />
                    <OverviewRowOrEmpty label="Industry" value={campaign.industry} />
                    <OverviewRowOrEmpty label="ABM" value={campaign.abm === true ? "Yes" : campaign.abm === false ? "No" : null} />
                  </div>
                  <div>
                    <OverviewRowOrEmpty label="Seniority" value={campaign.seniority} />
                    <OverviewRowOrEmpty label="Job Function" value={campaign.job_function} />
                    {campaign.creatives_url?.length ? (
                      <div style={overviewRowStyle}>
                        <span style={overviewLabelStyle}>Creatives URL</span>
                        <span style={{ ...overviewValueStyle, minWidth: 0, overflow: "hidden" }}>
                          {campaign.creatives_url.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={url}
                              style={{
                                display: "block",
                                marginBottom: 4,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                color: "#4f46e5",
                              }}
                            >
                              {url}
                            </a>
                          ))}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {campaign.additional_comments ? (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #f0f0f0" }}>
                <div style={overviewRowStyle}>
                  <span style={overviewLabelStyle}>Additional Comments</span>
                  <span style={overviewValueStyle}>
                    <ExpandableText text={campaign.additional_comments} />
                  </span>
                </div>
              </div>
            ) : null}
          </Card>
                <Card
                  title="Campaign Activity"
                  loading={logsLoading}
                  style={{
                    marginBottom: 24,
                    borderRadius: 8,
                    border: "1px solid #f0f0f0",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  }}
                  bodyStyle={{ padding: "24px 28px" }}
                >
                  {campaignLogs.length === 0 ? (
                    <Empty description="No campaign activity yet" />
                  ) : (
                    <div
                      style={{
                        maxHeight: 180,
                        overflowY: "auto",
                        paddingRight: 8,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        {campaignLogs.map((log, idx) => {
                          const actionMeta: Record<
                            string,
                            { label: string; color: string; dot: string }
                          > = {
                            campaign_created: {
                              label: "Created",
                              color: "#52c41a",
                              dot: "🟢",
                            },
                            campaign_updated: {
                              label: "Updated",
                              color: "#1677ff",
                              dot: "🔵",
                            },
                            campaign_status_changed: {
                              label: "Status Changed",
                              color: "#fa8c16",
                              dot: "🟠",
                            },
                          };
                          const meta =
                            actionMeta[log.action] ?? {
                              label: log.action.replace(/_/g, " "),
                              color: "#8c8c8c",
                              dot: "⚪",
                            };

                          const isLast = idx === campaignLogs.length - 1;

                          return (
                            <div
                              key={log.id}
                              style={{
                                display: "flex",
                                gap: 12,
                                paddingBottom: isLast ? 0 : 16,
                                marginBottom: isLast ? 0 : 16,
                                borderBottom: isLast ? "none" : "1px solid #f5f5f5",
                              }}
                            >
                              <div
                                style={{
                                  paddingTop: 2,
                                  fontSize: 16,
                                  flexShrink: 0,
                                }}
                              >
                                {meta.dot}
                              </div>

                              <div
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 8,
                                    marginBottom: 2,
                                  }}
                                >
                                  <Tag
                                    style={{
                                      color: meta.color,
                                      borderColor: meta.color,
                                      background: `${meta.color}10`,
                                      fontWeight: 600,
                                      fontSize: 11,
                                      textTransform: "capitalize",
                                      margin: 0,
                                    }}
                                  >
                                    {meta.label}
                                  </Tag>

                                  <Typography.Text
                                    type="secondary"
                                    style={{
                                      fontSize: 11,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {dayjs(log.created_at).format(
                                      "DD MMM YYYY, h:mm A"
                                    )}
                                  </Typography.Text>
                                </div>

                                <Typography.Text style={{ fontSize: 13 }}>
                                  {log.message}
                                </Typography.Text>
                              </div>
                            </div>
                          );
                        })}


                      </div>
                    </div>

                  )}
                </Card>

        </Col>

        <Col xs={24} lg={10}>
          <CampaignDetailsCard
            rows={[
              {
                label: "Campaign Code",
                value: headerCode?.text ?? campaign.campaign_code ?? campaign.campaign_id,
              },
              { label: "Lead Type", value: campaign.lead_type },
              {
                label: "Start Date",
                value: campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : null,
              },
              {
                label: "End Date",
                value: campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : null,
              },
              { label: "Geography", value: campaign.geography },
              {
                label: "Assigned Team Leaders",
                value:
                  assignedTlCount > 0
                    ? campaign.assigned_team_leader_name ?? assignedTlNames.join(", ")
                    : null,
              },
              { label: "Total Allocation", value: campaign.total_allocation },
              { label: "Post QA", value: campaign.post_qa },
              { label: "Achieved", value: campaign.achieved },
              { label: "Pending Allocation", value: campaign.pending_allocation },
            ]}
          />

          <Card
            title={
              <Space>
                <FileOutlined />
                <span>Files</span>
                <Tag style={{ marginLeft: 4 }}>{files.length}</Tag>
              </Space>
            }
            style={{ marginBottom: 24, borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
            bodyStyle={{ padding: "24px 28px" }}
          >
            {files.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "#6b7280", fontSize: 14 }}>
                <FileOutlined style={{ fontSize: 40, marginBottom: 12, display: "block", color: "#d1d5db" }} />
                No files uploaded for this campaign.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {files.map((f, idx) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 0",
                      borderBottom: idx < files.length - 1 ? "1px solid #f5f5f5" : "none",
                      gap: 12,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                      <FileOutlined style={{ color: "#6b7280", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file_name}</span>
                      {f.file_size != null && (
                        <Typography.Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                          {(f.file_size / 1024).toFixed(1)} KB
                        </Typography.Text>
                      )}
                    </span>
                    {f.download_url && (
                      <Button type="link" size="small" icon={<DownloadOutlined />} href={f.download_url} target="_blank" rel="noopener noreferrer" style={{ padding: "0 4px", flexShrink: 0 }}>
                        Download
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {isOperationsManager && (
            <Card
              title={
                <Space size={8}>
                  <TeamOutlined />
                  <span>Assigned Team Leaders</span>
                  <Badge
                    count={assignedTlCount}
                    showZero
                    overflowCount={99}
                    style={{ backgroundColor: assignedTlCount > 0 ? "#722ed1" : "#d1d5db" }}
                  />
                </Space>
              }
              extra={
                <Button type="link" icon={<UserAddOutlined />} onClick={openAssignTlModal} style={{ padding: 0 }}>
                  {assignedTlCount > 0 ? "Edit" : "Assign"}
                </Button>
              }
              style={{ marginBottom: 24, borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
              bodyStyle={{ padding: "24px 28px" }}
            >
              {assignedTlCount === 0 ? (
                <Typography.Text type="secondary">
                  No team leaders assigned yet.{" "}
                  <Button type="link" onClick={openAssignTlModal} style={{ padding: 0 }}>
                    Assign team leaders
                  </Button>
                </Typography.Text>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {effectiveTeamLeaderAssignments.map((a) => (
                    <Tag key={a.team_leader_id} color="purple">
                      {a.team_leader_name ?? a.team_leader_id}
                    </Tag>
                  ))}
                </div>
              )}
            </Card>
          )}

  {!isOperationsManager && (
  <Card
    title={
      <Space size={8}>
        <TeamOutlined />
        <span>Assigned Agents</span>
        <Badge
          count={assignedAgentCount}
          showZero
          overflowCount={99}
          style={{
            backgroundColor:
              assignedAgentCount > 0 ? "#4f46e5" : "#d1d5db",
          }}
        />
      </Space>
    }
    extra={
      <Space size={12}>
        {/* Collapse icon */}
        <Button
          type="text"
         size="middle"
          onClick={() => setIsAgentsCollapsed(!isAgentsCollapsed)}
          style={{
            padding: 0,
            height: "auto",
            color: "#595959",
            display:"flex",
            fontSize:"bold"
          }}
        >
          {isAgentsCollapsed ? <DownOutlined /> : <UpOutlined />}
        </Button>

        {/* Existing Edit / Assign button */}
        <Button
          type="link"
          icon={<UserAddOutlined />}
          onClick={openAssignModal}
          style={{ padding: 0 }}
        >
          {assignedAgentCount > 0 ? "Edit" : "Assign"}
        </Button>
      </Space>
    }
    style={{
      marginBottom: 24,
      borderRadius: 8,
      border: "1px solid #f0f0f0",
      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
    }}
    bodyStyle={{
      padding: "24px 28px",
      display: isAgentsCollapsed ? "none" : "block",
    }}
  >
    {assignments.length === 0 ? (
      <p style={{ color: "#6b7280", margin: 0 }}>
        No agents assigned.{" "}
        <Button
          type="link"
          onClick={openAssignModal}
          style={{ padding: 0 }}
        >
          Assign agents
        </Button>
      </p>
    ) : (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {assignments.map((a) => (
          <Tag key={a.agent_id} color="blue">
            {a.agent_name ?? a.agent_id}
          </Tag>
        ))}
      </div>
    )}
  </Card>
)}
        </Col>
      </Row>

      <Card
        title={`Leads (${total})`}
        extra={
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => void handleExport()}
              loading={exporting}
              disabled={total === 0 || exporting}
            >
              Export
            </Button>
            <Button icon={<UploadOutlined />} onClick={() => { setUploadModalOpen(true); setUploadFile(null); setParsedLeads([]); }}>
              Upload
            </Button>
          </Space>
        }
        style={{ borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
        bodyStyle={{ padding: "24px 28px" }}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%", marginBottom: 16 }}>
          <Row gutter={12} wrap align="middle">
            <Col>
              <Typography.Text type="secondary" style={{ marginRight: 8 }}>Date range (created):</Typography.Text>
            </Col>
            <Col>
              <DatePicker.RangePicker
                value={dateRange}
                onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null] | null)}
                allowClear
                style={{ width: 260 }}
              />
            </Col>
            <Col>
              <Button
                size="middle"
                onClick={() => setDateRange(null)}
                disabled={!dateRange?.[0] && !dateRange?.[1]}
              >
                Clear dates
              </Button>
            </Col>
            <Col flex="auto" style={{ minWidth: 200 }}>
              <Input.Search
                placeholder="Search leads (name, company, email, phone)..."
                allowClear
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                style={{ width: "100%", maxWidth: 280 }}
              />
            </Col>
                  {isTeamLeader && (
                    <Col>
                      <Button
                        size="middle"
                        type="primary"
                        disabled={selectedLeadIds.length === 0}
                        onClick={() => openMoveModal()}
                      >
                        Move to campaign
                        {selectedLeadIds.length > 0
                          ? ` (${selectedLeadIds.length})`
                          : ""}
                      </Button>
                    </Col>
                  )}

          </Row>
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 12 }}>
          Showing {leads.length} of {total} leads{hasActiveLeadFilters ? " (filtered)" : ""}. Click a row to edit.
        </Typography.Text>
        <Table
  className="table-single-line"
  columns={leadColumns}
  dataSource={leads}
  rowKey="id"
  rowSelection={
    isTeamLeader
      ? {
          selectedRowKeys: selectedLeadIds,
          onChange: (selectedRowKeys) => {
            setSelectedLeadIds(selectedRowKeys);
          },
          preserveSelectedRowKeys: true,
        }
      : undefined
  }
  scroll={{ x: 2600 }}
  pagination={{
    ...tablePagination,
    showTotal: (t) => `Total ${t} leads`,
  }}
  locale={{ emptyText: "No leads yet" }}
  size="middle"
  onRow={(record) => ({
    onClick: () => openEditLeadDrawer(record as Lead),
    style: { cursor: "pointer" },
  })}
/>

      </Card>
        </>
      )}

      <Modal
        title="Upload Leads (CSV or Excel)"
        open={uploadModalOpen}
        onCancel={() => { setUploadModalOpen(false); setUploadFile(null); setParsedLeads([]); }}
        onOk={handleImport}
        okText={parsedLeads.length > 0 ? `Import ${parsedLeads.length} leads` : "Import"}
        okButtonProps={{ disabled: parsedLeads.length === 0, loading: importing }}
        cancelButtonProps={{ disabled: importing }}
        width={520}
      >
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          Upload a CSV or Excel (.xlsx) file. Include the <strong>id</strong> column to update existing leads; rows without id will be created as new.
        </Typography.Text>
        <Upload.Dragger
          accept=".csv,.xlsx,.xls"
          multiple={false}
          beforeUpload={(file) => { handleUploadFile(file); return false; }}
          fileList={uploadFile ? [{ uid: "1", name: uploadFile.name, status: "done" }] : []}
          onRemove={() => { setUploadFile(null); setParsedLeads([]); }}
          maxCount={1}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 48, color: "#4f46e5" }} />
          </p>
          <p className="ant-upload-text">Click or drag CSV or Excel file here</p>
          <p className="ant-upload-hint">Export as Excel, edit (keep the lead_id or id column), then re-upload to update existing leads. Rows without an id are added as new leads.</p>
        </Upload.Dragger>
        {parsedLeads.length > 0 && (
          <Typography.Text style={{ display: "block", marginTop: 12, color: "#52c41a" }}>
            {parsedLeads.length} leads parsed and ready to import
          </Typography.Text>
        )}
      </Modal>

      <Modal
        title={
          <span>
            <TeamOutlined style={{ marginRight: 8 }} />
            Assign Team Leaders to Campaign
          </span>
        }
        open={assignTlModalOpen}
        onCancel={() => setAssignTlModalOpen(false)}
        onOk={handleAssignTeamLeaders}
        confirmLoading={assigningTl}
        okText={
          selectedTeamLeaderIds.length > 0
            ? `Save ${selectedTeamLeaderIds.length} team leader${selectedTeamLeaderIds.length === 1 ? "" : "s"}`
            : "Save (no team leaders)"
        }
        width={560}
      >
        <p style={{ marginBottom: 16, color: "#4b5563" }}>
          Move team leaders between lists to assign or unassign them from this campaign. Assigned team leaders can manage the campaign and assign agents.
        </p>
        {teamLeadersLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spin size="large" tip="Loading team leaders..." />
          </div>
        ) : teamLeaders.length === 0 ? (
          <Empty
            image={<TeamOutlined style={{ fontSize: 48, color: "#d1d5db" }} />}
            description="No Team Leaders found in your organization"
          />
        ) : (
          <Transfer
            dataSource={tlTransferData}
            titles={["Available", "Assigned"]}
            targetKeys={selectedTeamLeaderIds}
            onChange={(targetKeys) => setSelectedTeamLeaderIds(targetKeys.map(String))}
            render={(item) => (
              <span>
                <strong>{item.title}</strong>
                {item.description && <span style={{ color: "#6b7280", marginLeft: 8 }}>({item.description})</span>}
              </span>
            )}
            showSearch
            filterOption={(inputValue, item) =>
              (item.title?.toLowerCase() ?? "").includes(inputValue.toLowerCase()) ||
              (item.description?.toLowerCase() ?? "").includes(inputValue.toLowerCase())
            }
            listStyle={{ width: 240, height: 320 }}
            oneWay={false}
            pagination
          />
        )}
      </Modal>

      <Modal
        title={
          <span>
            <TeamOutlined style={{ marginRight: 8 }} />
            Assign Agents to Campaign
          </span>
        }
        open={assignModalOpen && !isOperationsManager}
        onCancel={() => setAssignModalOpen(false)}
        onOk={handleAssign}
        confirmLoading={assigning}
        okText={selectedAgentIds.length > 0 ? `Assign ${selectedAgentIds.length} agent${selectedAgentIds.length === 1 ? "" : "s"}` : "Save (no agents)"}
        width={560}
      >
        <p style={{ marginBottom: 16, color: "#4b5563" }}>
          Move agents between lists to assign or unassign them from this campaign. Assigned agents can view and manage leads.
        </p>
        {agentsLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spin size="large" tip="Loading agents..." />
          </div>
        ) : agents.length === 0 ? (
          <Empty
            image={<TeamOutlined style={{ fontSize: 48, color: "#d1d5db" }} />}
            description={
              <div>
                <p style={{ marginBottom: 8 }}>No agents in your organization.</p>
                <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
                  Create Agent users from the Team → Users page, then assign them here.
                </p>
                <Button type="primary" onClick={() => { setAssignModalOpen(false); router.push("/tl/users"); }}>
                  Go to Users
                </Button>
              </div>
            }
          />
        ) : (
          <Transfer
            dataSource={transferData}
            titles={["Available", "Assigned"]}
            targetKeys={selectedAgentIds}
            onChange={(targetKeys) => setSelectedAgentIds(targetKeys.map(String))}
            render={(item) => (
              <span>
                <strong>{item.title}</strong>
                {item.description && <span style={{ color: "#6b7280", marginLeft: 8 }}>({item.description})</span>}
              </span>
            )}
            showSearch
            filterOption={(inputValue, item) =>
              (item.title?.toLowerCase() ?? "").includes(inputValue.toLowerCase()) ||
              (item.description?.toLowerCase() ?? "").includes(inputValue.toLowerCase())
            }
            listStyle={{ width: 240, height: 320 }}
            oneWay={false}
            pagination
          />
        )}
      </Modal>

      <Modal
  title="Move Leads to Campaign"
  open={moveModalOpen}
  onCancel={() => {
    if (!movingLeads) {
      setMoveModalOpen(false);
      setMoveCampaignId(null);
    }
  }}
  onOk={() => void handleMoveLeads()}
  confirmLoading={movingLeads}
  okButtonProps={{
    disabled: !moveCampaignId || selectedLeadIds.length === 0,
  }}
  okText={`Move ${selectedLeadIds.length} Lead${
    selectedLeadIds.length === 1 ? "" : "s"
  }`}
  width={520}
>
  <div style={{ marginBottom: 20 }}>
    <Typography.Text>
      You have selected{" "}
      <strong>{selectedLeadIds.length}</strong>{" "}
      lead{selectedLeadIds.length === 1 ? "" : "s"}.
    </Typography.Text>
  </div>

  <Typography.Text
    strong
    style={{ display: "block", marginBottom: 8 }}
  >
    Select destination campaign
  </Typography.Text>

  {moveCampaignsLoading ? (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <Spin />
    </div>
  ) : moveCampaigns.length === 0 ? (
    <Empty description="No other campaigns available" />
  ) : (
    <Select
      style={{ width: "100%" }}
      placeholder="Select campaign"
      value={moveCampaignId ?? undefined}
      onChange={(value) => setMoveCampaignId(value)}
      showSearch
      optionFilterProp="label"
      options={moveCampaigns.map((item) => ({
        value: item.id,
        label: item.campaign_code
          ? `${item.name} (${item.campaign_code})`
          : item.name,
      }))}
    />
  )}

  {moveCampaignId && (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        background: "#f5f5f5",
        borderRadius: 6,
      }}
    >
      <Typography.Text type="secondary">
        {selectedLeadIds.length} selected lead
        {selectedLeadIds.length === 1 ? "" : "s"} will be moved
        from <strong>{campaign.name}</strong> to{" "}
        <strong>
          {
            moveCampaigns.find(
              (c) => c.id === moveCampaignId
            )?.name
          }
        </strong>
        .
      </Typography.Text>
    </div>
  )}
</Modal>

      <Drawer
        title="Edit Lead"
        placement="right"
        width={LEAD_DRAWER_WIDTH}
        open={leadDrawerOpen}
        onClose={closeLeadDrawer}
        destroyOnClose
        styles={{ body: LEAD_DRAWER_BODY_STYLE }}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <Button onClick={closeLeadDrawer}>Cancel</Button>
            <Button type="primary" loading={updatingLead} onClick={handleUpdateLead}>
              Save Changes
            </Button>
          </div>
        }
      >
        <LeadDrawerContent
          form={form}
          mode="edit"
          lead={editingLead ?? undefined}
          canEditQaAudit={canEditQaAudit}
          campaignQuestions={campaignQuestions}
          campaignName={campaign?.name}
        />
      </Drawer>

      {showFeedTab && campaign && viewTab !== "feed" && (
        <CampaignFeedChatWidget
          campaignId={id!}
          campaignName={campaign.name}
          unreadCount={unreadCount}
          open={feedChatOpen}
          onOpenChange={setFeedChatOpen}
          onExpand={() => setViewTab("feed")}
        />
      )}
    </div>
  );
}
