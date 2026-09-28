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
  Segmented,
  Input,
  message,
  Spin,
  Typography,
  Empty,
  Row,
  Col,
  Space,
  Drawer,
  Form,
  Upload,
  DatePicker,
  Badge,
  Tooltip,
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
  assigned_stl_id?: string | null;
  assigned_stl_name?: string | null;
  stl_assignments?: StlAssignment[];
  /** Real downstream Team Leader delegation — set once the STL delegates this campaign to a TL. */
  assigned_team_leader_id?: string | null;
  team_leader_assignments?: { team_leader_id: string; team_leader_name: string | null }[];
  employee_size?: string[] | null;
  abm?: boolean | null;
  seniority?: string | null;
  job_function?: string | null;
  creatives_url?: string[] | null;
  created_at?: string;
  campaign_questions?: unknown;
};

type PersonOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type StlAssignment = {
  stl_id: string;
  stl_name: string | null;
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

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const { hasRole, hasSTLAccess, isInitialized, roles } = useAuth();
  const isOperationsManager = hasRole("operations_manager");
  const showFeedTab = hasCampaignFeedRole(
    roles.map((r) => (typeof r === "string" ? r : (r.role_name ?? r.name ?? "")))
  );
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
  const [stlAssignments, setStlAssignments] = useState<StlAssignment[]>([]);
  const [files, setFiles] = useState<CampaignFile[]>([]);
  const [loading, setLoading] = useState(true);

  // OM: "Assign Senior Team Leaders" modal
  const [assignStlModalOpen, setAssignStlModalOpen] = useState(false);
  const [stlOptions, setStlOptions] = useState<PersonOption[]>([]);
  const [stlOptionsLoading, setStlOptionsLoading] = useState(false);
  const [selectedStlIds, setSelectedStlIds] = useState<string[]>([]);
  const [assigningStl, setAssigningStl] = useState(false);

  // STL: "Assign" modal — delegate to Team Leader, or assign agents directly
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<"team_leader" | "agents">("agents");
  const [teamLeaderOptions, setTeamLeaderOptions] = useState<PersonOption[]>([]);
  const [selectedTeamLeaderIds, setSelectedTeamLeaderIds] = useState<string[]>([]);
  const [agentOptions, setAgentOptions] = useState<PersonOption[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [assignModalLoading, setAssignModalLoading] = useState(false);
  const [assigningCampaign, setAssigningCampaign] = useState(false);

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

  const effectiveStlAssignments = useMemo(() => {
    const byId = new Map<string, StlAssignment>();
    for (const row of stlAssignments) {
      if (row.stl_id) byId.set(row.stl_id, row);
    }
    for (const row of campaign?.stl_assignments ?? []) {
      if (row.stl_id && !byId.has(row.stl_id)) {
        byId.set(row.stl_id, row);
      }
    }
    if (campaign?.assigned_stl_id && !byId.has(campaign.assigned_stl_id)) {
      byId.set(campaign.assigned_stl_id, {
        stl_id: campaign.assigned_stl_id,
        stl_name: campaign.assigned_stl_name ?? null,
      });
    }
    return [...byId.values()];
  }, [stlAssignments, campaign]);

  const assignedStlCount = effectiveStlAssignments.length;
  const campaignQuestions = useMemo(
    () => normalizeCampaignQuestions(campaign?.campaign_questions),
    [campaign?.campaign_questions]
  );

  const assignedStlNames = useMemo(
    () =>
      effectiveStlAssignments
        .map((a) => a.stl_name?.trim() || null)
        .filter((name): name is string => Boolean(name)),
    [effectiveStlAssignments]
  );
  const assignedStlTooltip =
    assignedStlCount > 0
      ? assignedStlNames.length > 0
        ? assignedStlNames.join(", ")
        : `${assignedStlCount} Senior Team Leader${assignedStlCount === 1 ? "" : "s"} assigned`
      : "No Senior Team Leaders assigned yet";

  const fetchCampaign = useCallback(async (id: string) => {
    const silent = initialLeadsLoadDoneRef.current;
    initialLeadsLoadDoneRef.current = true;
    if (!silent) setLoading(true);
    try {
      const url = buildListApiUrl(`/api/stl/campaigns/${id}`, {
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
      const stlRows =
        data.stl_assignments ??
        data.campaign?.stl_assignments ??
        [];
      const legacyId = data.campaign?.assigned_stl_id as string | null | undefined;
      const legacyName = data.campaign?.assigned_stl_name as string | null | undefined;
      if (legacyId && !stlRows.some((r: StlAssignment) => r.stl_id === legacyId)) {
        setStlAssignments([
          ...stlRows,
          { stl_id: legacyId, stl_name: legacyName ?? null },
        ]);
      } else {
        setStlAssignments(stlRows);
      }
      setFiles(data.files ?? []);
      setCampaignId(id);
    } catch {
      message.error("Failed to load campaign");
      routerRef.current.replace("/stl/dashboard");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, pageSize, applyPaginationMeta, leadSearch, dateRange]);

  useEffect(() => {
    if (!id) {
      router.replace("/stl/dashboard");
      return;
    }
    if (!isInitialized) return;
    if (!hasSTLAccess()) {
      router.replace("/login");
      return;
    }
    fetchCampaign(id);
  }, [id, isInitialized, hasSTLAccess, router, fetchCampaign]);

  useEffect(() => {
    assignQueryHandledRef.current = false;
    initialLeadsLoadDoneRef.current = false;
    resetPage();
  }, [id, resetPage]);

  useEffect(() => {
    if (!campaignId || assignQueryHandledRef.current) return;

    const openAssignStl = searchParams.get("assignTl") === "1" && isOperationsManager;
    const openAssign = searchParams.get("assign") === "1" && !isOperationsManager;

    if (!openAssignStl && !openAssign) return;

    assignQueryHandledRef.current = true;
    if (openAssignStl) setAssignStlModalOpen(true);
    if (openAssign) setAssignModalOpen(true);
    router.replace(`/stl/campaigns/${campaignId}`, { scroll: false });
  }, [searchParams, campaignId, isOperationsManager, router]);

  // ── OM: Assign Senior Team Leaders modal ──────────────────────────────
  useEffect(() => {
    if (!assignStlModalOpen) return;
    setSelectedStlIds(effectiveStlAssignments.map((a) => a.stl_id));
    setStlOptionsLoading(true);
    fetch("/api/stl/team-leaders", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setStlOptions(data.stls ?? []);
        if (data.error) message.warning(data.error);
      })
      .catch(() => message.error("Failed to load Senior Team Leaders"))
      .finally(() => setStlOptionsLoading(false));
  }, [assignStlModalOpen, effectiveStlAssignments]);

  // ── STL: Assign modal — delegate to Team Leader, or assign agents directly ──
  useEffect(() => {
    if (!assignModalOpen || isOperationsManager) return;

    let cancelled = false;
    setAssignModalLoading(true);
    setAssignMode("agents");
    setSelectedAgentIds(assignments.map((a) => a.agent_id));

    Promise.all([
      fetch("/api/stl/team-leader-options", { credentials: "include" }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load Team Leaders");
        return data as { team_leaders?: PersonOption[] };
      }),
      fetch("/api/stl/agents", { credentials: "include" }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load agents");
        return data as { agents?: PersonOption[] };
      }),
    ])
      .then(([tlData, agentData]) => {
        if (cancelled) return;
        const myTeam = tlData.team_leaders ?? [];
        setTeamLeaderOptions(myTeam);
        const myTeamIds = new Set(myTeam.map((tl) => tl.id));
        setSelectedTeamLeaderIds(
          (campaign?.team_leader_assignments ?? [])
            .map((a) => a.team_leader_id)
            .filter((tlId) => myTeamIds.has(tlId))
        );
        setAgentOptions(agentData.agents ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          message.error(error instanceof Error ? error.message : "Failed to load assignment options");
        }
      })
      .finally(() => {
        if (!cancelled) setAssignModalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assignModalOpen, isOperationsManager, assignments, campaign?.team_leader_assignments]);

  const openAssignModal = () => setAssignModalOpen(true);
  const openAssignStlModal = () => setAssignStlModalOpen(true);

  const handleAssignStl = async () => {
    if (!campaignId) return;
    setAssigningStl(true);
    try {
      const res = await fetch(`/api/stl/campaigns/${campaignId}/assign-stl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stl_ids: selectedStlIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      message.success(
        selectedStlIds.length > 0
          ? `${selectedStlIds.length} Senior Team Leader${selectedStlIds.length === 1 ? "" : "s"} assigned`
          : "Senior Team Leaders removed"
      );
      setAssignStlModalOpen(false);
      void fetchCampaign(campaignId);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to assign Senior Team Leaders");
    } finally {
      setAssigningStl(false);
    }
  };

  const stlTransferData = useMemo(
    () =>
      stlOptions.map((s) => ({
        key: s.id,
        title: s.full_name || s.email || "Unknown",
        description: s.email || "",
      })),
    [stlOptions]
  );

  const agentTransferData = useMemo(
    () =>
      agentOptions.map((a) => ({
        key: a.id,
        title: a.full_name || a.email || "Unknown",
        description: a.email || "",
      })),
    [agentOptions]
  );

  const teamLeaderTransferData = useMemo(
    () =>
      teamLeaderOptions.map((tl) => ({
        key: tl.id,
        title: tl.full_name || tl.email || "Unknown",
        description: tl.email || "",
      })),
    [teamLeaderOptions]
  );

  const handleDelegateToTeamLeader = async () => {
    if (!campaignId) return;
    setAssigningCampaign(true);
    try {
      const res = await fetch(`/api/stl/campaigns/${campaignId}/assign-to-team-leader`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ team_leader_ids: selectedTeamLeaderIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delegate campaign");
      message.success("Campaign delegated to Team Leader");
      setAssignModalOpen(false);
      fetchCampaign(campaignId);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to delegate campaign");
    } finally {
      setAssigningCampaign(false);
    }
  };

  const handleAssignAgents = async () => {
    if (!campaignId) return;
    setAssigningCampaign(true);
    try {
      const res = await fetch(`/api/stl/campaigns/${campaignId}/assign`, {
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
      setAssigningCampaign(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/stl/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      message.success("Campaign updated");
      fetchCampaign(campaignId);
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
      const res = await fetch(`/api/stl/campaigns/${campaignId}/leads`, {
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
      const url = buildListApiUrl(`/api/stl/campaigns/${campaignId}`, {
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
        campaign?.assigned_stl_name
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
      const res = await fetch(`/api/stl/campaigns/${campaignId}/leads/import`, {
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
          href="/stl/campaigns"
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
              {isOperationsManager && assignedStlCount > 0 && (
                <Tooltip title={assignedStlTooltip}>
                  <Tag color="purple" icon={<TeamOutlined />} style={{ margin: 0 }}>
                    {assignedStlCount} Senior Team Leader{assignedStlCount === 1 ? "" : "s"} assigned
                  </Tag>
                </Tooltip>
              )}
              {isOperationsManager && assignedStlCount === 0 && (
                <Tag style={{ margin: 0 }}>No Senior Team Leader assigned</Tag>
              )}
              {!isOperationsManager && assignedAgentCount > 0 && (
                <Tooltip title={assignedAgentTooltip}>
                  <Tag color="blue" icon={<TeamOutlined />} style={{ margin: 0 }}>
                    {assignedAgentCount} agent{assignedAgentCount === 1 ? "" : "s"} assigned
                  </Tag>
                </Tooltip>
              )}
              {!isOperationsManager && campaign.assigned_team_leader_id && (
                <Tag color="geekblue" style={{ margin: 0 }}>
                  Delegated to Team Leader
                </Tag>
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
                <Tooltip title={assignedStlTooltip}>
                  <Badge
                    count={assignedStlCount}
                    showZero={false}
                    size="small"
                    overflowCount={99}
                    offset={[-6, 6]}
                    style={{ backgroundColor: "#722ed1" }}
                  >
                    <Button icon={<UserAddOutlined />} onClick={openAssignStlModal}>
                      {assignedStlCount > 0 ? "Manage Senior Team Leaders" : "Assign Senior Team Leader"}
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
                      {assignedAgentCount > 0 ? "Manage Assignment" : "Assign"}
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
            {(campaign.employee_size?.length || campaign.industry || campaign.abm != null || campaign.seniority || campaign.job_function || campaign.creatives_url?.length) ? (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Targeting</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0 32px" }}>
                  <div>
                    <OverviewRowOrEmpty label="Employee Size" value={campaign.employee_size?.length ? campaign.employee_size.join(", ") : null} />
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
                label: "Assigned Senior Team Leaders",
                value:
                  assignedStlCount > 0
                    ? campaign.assigned_stl_name ?? assignedStlNames.join(", ")
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
                  <span>Assigned Senior Team Leaders</span>
                  <Badge
                    count={assignedStlCount}
                    showZero
                    overflowCount={99}
                    style={{ backgroundColor: assignedStlCount > 0 ? "#722ed1" : "#d1d5db" }}
                  />
                </Space>
              }
              extra={
                <Button type="link" icon={<UserAddOutlined />} onClick={openAssignStlModal} style={{ padding: 0 }}>
                  {assignedStlCount > 0 ? "Edit" : "Assign"}
                </Button>
              }
              style={{ marginBottom: 24, borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
              bodyStyle={{ padding: "24px 28px" }}
            >
              {assignedStlCount === 0 ? (
                <Typography.Text type="secondary">
                  No Senior Team Leaders assigned yet.{" "}
                  <Button type="link" onClick={openAssignStlModal} style={{ padding: 0 }}>
                    Assign Senior Team Leaders
                  </Button>
                </Typography.Text>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {effectiveStlAssignments.map((a) => (
                    <Tag key={a.stl_id} color="purple">
                      {a.stl_name ?? a.stl_id}
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
                    style={{ backgroundColor: assignedAgentCount > 0 ? "#4f46e5" : "#d1d5db" }}
                  />
                </Space>
              }
              extra={
                <Button type="link" icon={<UserAddOutlined />} onClick={openAssignModal} style={{ padding: 0 }}>
                  {assignedAgentCount > 0 ? "Edit" : "Assign"}
                </Button>
              }
              style={{ marginBottom: 24, borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
              bodyStyle={{ padding: "24px 28px" }}
            >
              {assignments.length === 0 ? (
                <p style={{ color: "#6b7280", margin: 0 }}>
                  No agents assigned.{" "}
                  <Button type="link" onClick={openAssignModal} style={{ padding: 0 }}>
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

      {/* OM: Assign Senior Team Leaders modal */}
      <Modal
        title={
          <span>
            <TeamOutlined style={{ marginRight: 8 }} />
            Assign Senior Team Leaders to Campaign
          </span>
        }
        open={assignStlModalOpen}
        onCancel={() => setAssignStlModalOpen(false)}
        onOk={handleAssignStl}
        confirmLoading={assigningStl}
        okText={
          selectedStlIds.length > 0
            ? `Save ${selectedStlIds.length} Senior Team Leader${selectedStlIds.length === 1 ? "" : "s"}`
            : "Save (no Senior Team Leaders)"
        }
        width={560}
      >
        <p style={{ marginBottom: 16, color: "#4b5563" }}>
          Move Senior Team Leaders between lists to assign or unassign them from this campaign. Assigned Senior Team Leaders can manage the campaign, assign agents, or delegate to a Team Leader.
        </p>
        {stlOptionsLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spin size="large" tip="Loading Senior Team Leaders..." />
          </div>
        ) : stlOptions.length === 0 ? (
          <Empty
            image={<TeamOutlined style={{ fontSize: 48, color: "#d1d5db" }} />}
            description="No Senior Team Leaders found in your organization"
          />
        ) : (
          <Transfer
            dataSource={stlTransferData}
            titles={["Available", "Assigned"]}
            targetKeys={selectedStlIds}
            onChange={(targetKeys) => setSelectedStlIds(targetKeys.map(String))}
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

      {/* STL: Assign modal — delegate to Team Leader, or assign agents directly */}
      <Modal
        title={
          <span>
            <TeamOutlined style={{ marginRight: 8 }} />
            Assign Campaign
          </span>
        }
        open={assignModalOpen && !isOperationsManager}
        onCancel={() => setAssignModalOpen(false)}
        onOk={assignMode === "team_leader" ? handleDelegateToTeamLeader : handleAssignAgents}
        confirmLoading={assigningCampaign}
        okText={assignMode === "team_leader" ? "Save Delegation" : (selectedAgentIds.length > 0 ? `Assign ${selectedAgentIds.length} agent${selectedAgentIds.length === 1 ? "" : "s"}` : "Save (no agents)")}
        width={560}
      >
        <div style={{ marginBottom: 16 }}>
          <Segmented
            block
            value={assignMode}
            onChange={(value) => setAssignMode(value as "team_leader" | "agents")}
            options={[
              { label: "Assign to Agents", value: "agents" },
              { label: "Delegate to Team Leader", value: "team_leader" },
            ]}
          />
          {assignMode === "team_leader" && (
            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
              Only Team Leaders on your own team are shown here.
            </Typography.Text>
          )}
        </div>

        {assignModalLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spin size="large" tip="Loading..." />
          </div>
        ) : assignMode === "team_leader" ? (
          teamLeaderOptions.length === 0 ? (
            <Empty
              image={<TeamOutlined style={{ fontSize: 48, color: "#d1d5db" }} />}
              description="No Team Leaders on your team yet — ask Operations to assign one to you first"
            />
          ) : (
            <Transfer
              dataSource={teamLeaderTransferData}
              titles={["Available", "Delegated"]}
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
          )
        ) : agentOptions.length === 0 ? (
          <Empty
            image={<TeamOutlined style={{ fontSize: 48, color: "#d1d5db" }} />}
            description={
              <div>
                <p style={{ marginBottom: 8 }}>No agents in your organization.</p>
                <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
                  Create Agent users from the Team → Users page, then assign them here.
                </p>
                <Button type="primary" onClick={() => { setAssignModalOpen(false); router.push("/stl/users"); }}>
                  Go to Users
                </Button>
              </div>
            }
          />
        ) : (
          <Transfer
            dataSource={agentTransferData}
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
