"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  Button,
  Table,
  Tag,
  Input,
  message,
  Spin,
  Typography,
  Row,
  Col,
  Space,
  Drawer,
  Form,
  Modal,
  DatePicker,
  Upload,
  Transfer,
  Empty,
  Badge,
  Tooltip,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  LEADS_TABLE_PAGE_SIZE_DEFAULT,
  LEADS_TABLE_PAGE_SIZE_OPTIONS,
} from "@/lib/leads-table-pagination";
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  LeftOutlined,
  SaveOutlined,
  DownloadOutlined,
  UploadOutlined,
  InboxOutlined,
  UserAddOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { downloadExcel } from "@/lib/leadsExport";
import { parseLeadsCsv, parseLeadsExcel } from "@/lib/leadsImport";
import { LeadDrawerContent, LEAD_DRAWER_WIDTH, LEAD_DRAWER_BODY_STYLE } from "@/components/Leads/LeadDrawerContent";
import { getLeadTableColumns } from "@/components/Leads/LeadTableColumns";
import { buildLeadPayload, leadToFormValues } from "@/lib/leadPayload";
import type { Lead } from "@/types/lead.types";
import { ExpandableText, renderExpandableOverviewValue } from "@/components/ExpandableText";
import { campaignHeaderDisplayCode } from "@/lib/campaign-display";
import { CampaignDetailsCard } from "@/components/Campaigns/CampaignDetailsCard";
import { CampaignFilesCard, type CampaignFileItem } from "@/components/Campaigns/CampaignFilesCard";
import { normalizeCampaignQuestions } from "@/lib/campaign-questions";

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
  employee_size?: string[] | null;
  revenue_size?: string[] | null;
  abm?: boolean | null;
  seniority?: string | null;
  job_function?: string | null;
  creatives_url?: string[] | null;
  created_at?: string;
  campaign_questions?: unknown;
  lead_aggregated?: string | null;
};

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

function OverviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div style={overviewRowStyle}>
      <span style={overviewLabelStyle}>{label}</span>
      <span style={overviewValueStyle}>{renderExpandableOverviewValue(value, overviewValueStyle)}</span>
    </div>
  );
}

function OverviewRowOrEmpty({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={overviewRowStyle}>
      <span style={overviewLabelStyle}>{label}</span>
      <span style={overviewValueStyle}>
        {renderExpandableOverviewValue(value ?? "—", overviewValueStyle)}
      </span>
    </div>
  );
}

type AssignableAgent = { id: string; full_name: string | null; email: string | null };

type CampaignAgentAssignment = { agent_id: string; agent_name: string | null };

export type QaCampaignDetailViewProps = {
  /** UI route prefix, e.g. `/qa/campaigns` or `/emm/campaigns`. */
  basePath?: string;
  /** Roles allowed to view this page. */
  guardRoles?: string[];
  /**
   * API prefix backing the agent-assignment flow, e.g. `/api/emm/campaigns`.
   * Omit to hide the Assign Agents action entirely (QA has no assign rights).
   */
  assignAgentsApiPrefix?: string;
};

export function QaCampaignDetailView({
  basePath = "/qa/campaigns",
  guardRoles = ["qa", "admin"],
  assignAgentsApiPrefix,
}: QaCampaignDetailViewProps) {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string | undefined;
  const { hasRole } = useAuth();
  const { status: guardStatus } = useRoleGuard(guardRoles);
  const canEditQaAudit = hasRole("qa") || hasRole("admin");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [files, setFiles] = useState<CampaignFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [savingDrawer, setSavingDrawer] = useState(false);
  const [form] = Form.useForm();
  const [leadSearch, setLeadSearch] = useState("");
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPageSize, setLeadsPageSize] = useState(LEADS_TABLE_PAGE_SIZE_DEFAULT);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [previousConfirmOpen, setPreviousConfirmOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<Record<string, unknown>[]>([]);
  const [importing, setImporting] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const [assignments, setAssignments] = useState<CampaignAgentAssignment[]>([]);
  const [assignDataLoading, setAssignDataLoading] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  const assignedAgentCount = assignments.length;
  const assignedAgentTooltip =
    assignedAgentCount > 0
      ? assignments
          .map((a) => a.agent_name)
          .filter((name): name is string => Boolean(name))
          .join(", ") ||
        `${assignedAgentCount} agent${assignedAgentCount === 1 ? "" : "s"} assigned`
      : "No agents assigned yet";

  const agentTransferData = useMemo(
    () =>
      agents.map((a) => ({
        key: a.id,
        title: a.full_name || a.email || "Unknown",
        description: a.email || "",
      })),
    [agents]
  );

  const fetchAssignData = useCallback(async () => {
    if (!assignAgentsApiPrefix || !id) return;
    setAssignDataLoading(true);
    try {
      const res = await fetch(`${assignAgentsApiPrefix}/${id}/assign`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load agents");
      setAgents(data.agents ?? []);
      setAssignments(data.assignments ?? []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setAssignDataLoading(false);
    }
  }, [assignAgentsApiPrefix, id]);

  const handleAssignAgents = async () => {
    if (!assignAgentsApiPrefix || !id) return;
    setAssigning(true);
    try {
      const res = await fetch(`${assignAgentsApiPrefix}/${id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agent_ids: selectedAgentIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      message.success(
        selectedAgentIds.length > 0
          ? `${selectedAgentIds.length} agent${selectedAgentIds.length === 1 ? "" : "s"} assigned`
          : "All agents unassigned"
      );
      setAssignModalOpen(false);
      await fetchAssignData();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to assign agents");
    } finally {
      setAssigning(false);
    }
  };

  const campaignQuestions = useMemo(
    () => normalizeCampaignQuestions(campaign?.campaign_questions),
    [campaign?.campaign_questions]
  );

  const rectifiedLeadCount = useMemo(
    () =>
      leads.filter(
        (lead) =>
          String(lead.qa_status ?? "").trim().toLowerCase() === "rectified" &&
          String(lead.rectification_status ?? "").trim().toLowerCase() === "rectified"
      ).length,
    [leads]
  );

  const fetchCampaign = useCallback(async (campaignId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/qa/campaigns/${campaignId}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setCampaign(data.campaign);
      setLeads(data.leads ?? []);
      setFiles(data.files ?? []);
    } catch {
      message.error("Failed to load campaign");
      router.replace(basePath);
    } finally {
      setLoading(false);
    }
  }, [router, basePath]);

  useEffect(() => {
    if (guardStatus !== "authorized") return;
    if (!id) {
      router.replace(basePath);
      return;
    }
    fetchCampaign(id);
  }, [id, guardStatus, router, fetchCampaign, basePath]);

  useEffect(() => {
    if (guardStatus !== "authorized") return;
    void fetchAssignData();
  }, [guardStatus, fetchAssignData]);

  useEffect(() => {
    if (assignModalOpen) {
      setSelectedAgentIds(assignments.map((a) => a.agent_id));
    }
  }, [assignModalOpen, assignments]);

  const filteredLeads = leads.filter((l) => {
    const matchesSearch = !leadSearch.trim()
      ? true
      : (l.name ?? "").toLowerCase().includes(leadSearch.trim().toLowerCase()) ||
        (l.company_name ?? "").toLowerCase().includes(leadSearch.trim().toLowerCase()) ||
        (l.email ?? "").toLowerCase().includes(leadSearch.trim().toLowerCase()) ||
        (l.phone ?? "").toLowerCase().includes(leadSearch.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (!dateRange || !dateRange[0] || !dateRange[1]) return true;
    const leadDate = dayjs(l.created_at).startOf("day");
    const start = dateRange[0].startOf("day");
    const end = dateRange[1].endOf("day");
    return !leadDate.isBefore(start) && !leadDate.isAfter(end);
  });

  useEffect(() => {
    setLeadsPage(1);
  }, [leadSearch, dateRange]);

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

  function getDrawerLeadContext(): { campaignIndex: number; leadIndex: number; nextLead: Lead | null; prevLead: Lead | null } {
    if (!editingLead) return { campaignIndex: -1, leadIndex: -1, nextLead: null, prevLead: null };
    const list = filteredLeads;
    const leadIndex = list.findIndex((l) => l.id === editingLead.id);
    if (leadIndex < 0) return { campaignIndex: -1, leadIndex: -1, nextLead: null, prevLead: null };
    const nextLead = leadIndex < list.length - 1 ? list[leadIndex + 1] : null;
    const prevLead = leadIndex > 0 ? list[leadIndex - 1] : null;
    return { campaignIndex: 0, leadIndex, nextLead, prevLead };
  }

  const handlePreviousLead = () => {
    const { prevLead } = getDrawerLeadContext();
    if (prevLead) {
      if (form.isFieldsTouched()) {
        setPreviousConfirmOpen(true);
        (window as unknown as { __qa_prev_lead?: Lead })["__qa_prev_lead"] = prevLead;
        return;
      }
      openEditLeadDrawer(prevLead);
    }
  };

  const handleDrawerSave = async (saveAndContinue?: boolean) => {
    if (!id || !editingLead) return;
    try {
      const values = await form.validateFields();
      setSavingDrawer(true);
      const payload = { ...buildLeadPayload(values), id: editingLead.id };
      const res = await fetch(`/api/tl/campaigns/${id}/leads`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update lead");
      message.success("Lead updated");
      await fetchCampaign(id);
      if (saveAndContinue) {
        const { nextLead } = getDrawerLeadContext();
        if (nextLead) {
          openEditLeadDrawer(nextLead);
        } else {
          closeLeadDrawer();
        }
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to update lead");
    } finally {
      setSavingDrawer(false);
    }
  };

  const handleConfirmPreviousSave = async () => {
    const prevLead = (window as unknown as { __qa_prev_lead?: Lead })["__qa_prev_lead"];
    setPreviousConfirmOpen(false);
    (window as unknown as { __qa_prev_lead?: Lead })["__qa_prev_lead"] = undefined;
    if (!prevLead) return;
    await handleDrawerSave(false);
    openEditLeadDrawer(prevLead);
  };

  const handleExport = () => {
    if (filteredLeads.length === 0) {
      message.warning("No leads to export");
      return;
    }
    downloadExcel(
      filteredLeads,
      `leads-${campaign?.name?.replace(/\s+/g, "-") ?? "export"}-${dayjs().format("YYYY-MM-DD")}.xlsx`,
      campaign?.name,
      campaign?.lead_type,
      campaign?.assigned_team_leader_name
    );
    message.success(`Exported ${filteredLeads.length} leads`);
    void fetch("/api/qa/recordings/export-audit", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        export_kind: "leads_xlsx",
        campaign_id: id,
        campaign_name: campaign?.name,
        row_count: filteredLeads.length,
      }),
    });
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
          const parsed = parseLeadsCsv(text);
          setParsedLeads(parsed);
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
          const parsed = parseLeadsExcel(buffer);
          setParsedLeads(parsed);
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
    if (!id || parsedLeads.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/tl/campaigns/${id}/leads/import`, {
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
      fetchCampaign(id);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (guardStatus === "loading" || guardStatus === "redirecting") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (loading && !campaign) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
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
    pagination: { current: leadsPage, pageSize: leadsPageSize },
    showDeliveryStatus: true,
  });

  const headerCode = campaignHeaderDisplayCode(campaign);

  return (
    <div style={{ width: "100%", padding: "0 24px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <Link
          href={basePath}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            color: "#4f46e5",
            textDecoration: "none",
            marginBottom: 16,
          }}
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
            <Typography.Title level={3} style={{ margin: 0, marginBottom: 6, fontWeight: 600 }}>
              {campaign.name}
            </Typography.Title>
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
              {(campaign.industry || campaign.geography) && (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {[campaign.industry, campaign.geography].filter(Boolean).join(" · ")}
                </Typography.Text>
              )}
            </Space>
          </Col>
          <Col>
            <Space size="middle" wrap>
              {assignAgentsApiPrefix && (
                <Tooltip title={assignedAgentTooltip}>
                  <Badge
                    count={assignedAgentCount}
                    size="small"
                    offset={[-4, 2]}
                    style={{ backgroundColor: assignedAgentCount > 0 ? "#4f46e5" : "#d1d5db" }}
                  >
                    <Button
                      icon={<UserAddOutlined />}
                      onClick={() => setAssignModalOpen(true)}
                      loading={assignDataLoading}
                    >
                      {assignedAgentCount > 0 ? "Manage Agents" : "Assign Agents"}
                    </Button>
                  </Badge>
                </Tooltip>
              )}
              <Button icon={<ReloadOutlined />} onClick={() => fetchCampaign(id!)} loading={loading}>
                Refresh
              </Button>
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
            {(campaign.description || campaign.target_designation || campaign.additional_comments) && (
              <div style={{ marginBottom: 20 }}>
                {campaign.description && <OverviewRow label="Description" value={campaign.description} />}
                {campaign.target_designation && <OverviewRow label="Target Designation" value={campaign.target_designation} />}
                {campaign.additional_comments && (
                  <div style={overviewRowStyle}>
                    <span style={overviewLabelStyle}>Additional Comments</span>
                    <span style={overviewValueStyle}>
                      <ExpandableText text={campaign.additional_comments} />
                    </span>
                  </div>
                )}
              </div>
            )}
            {(campaign.employee_size?.length ||
              campaign.revenue_size?.length ||
              campaign.abm != null ||
              campaign.seniority ||
              campaign.job_function ||
              campaign.creatives_url?.length) ? (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Targeting</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0 32px" }}>
                  <div>
                    <OverviewRowOrEmpty label="Employee Size" value={campaign.employee_size?.length ? campaign.employee_size.join(", ") : null} />
                    <OverviewRowOrEmpty label="Revenue Size" value={campaign.revenue_size?.length ? campaign.revenue_size.join(", ") : null} />
                    <OverviewRowOrEmpty label="ABM" value={campaign.abm === true ? "Yes" : campaign.abm === false ? "No" : null} />
                    <OverviewRowOrEmpty label="Seniority" value={campaign.seniority} />
                    <OverviewRowOrEmpty label="Job Function" value={campaign.job_function} />
                  </div>
                  <div>
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
              { label: "Assigned Team Leader", value: campaign.assigned_team_leader_name },
              { label: "Total Allocation", value: campaign.total_allocation },
              { label: "Post QA", value: campaign.post_qa },
              { label: "Achieved", value: campaign.achieved },
              { label: "Rectified", value: rectifiedLeadCount },
              { label: "Pending Allocation", value: campaign.pending_allocation },
              { label: "Industry", value: campaign.industry },
              { label: "Aggregator", value: campaign.lead_aggregated },
            ]}
          />
          <CampaignFilesCard files={files} />
        </Col>
      </Row>

      <Card
        title={`Leads (${leads.length})`}
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
            <Col>
              <Space>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleExport}
                  disabled={filteredLeads.length === 0}
                >
                  Export
                </Button>
                <Button
                  icon={<UploadOutlined />}
                  onClick={() => {
                    setUploadModalOpen(true);
                    setUploadFile(null);
                    setParsedLeads([]);
                  }}
                >
                  Upload
                </Button>
              </Space>
            </Col>
          </Row>
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 12 }}>
          Click a lead row to edit. Agent status = pipeline; QA status = your review outcome. Showing {filteredLeads.length} of {leads.length} leads.
        </Typography.Text>
        <Table
          className="table-single-line"
          columns={leadColumns}
          dataSource={filteredLeads}
          rowKey="id"
          scroll={{ x: 2600 }}
          pagination={{
            current: leadsPage,
            pageSize: leadsPageSize,
            showSizeChanger: true,
            pageSizeOptions: [...LEADS_TABLE_PAGE_SIZE_OPTIONS],
            showTotal: (t) => `Total ${t} leads`,
            onChange: (page, size) => {
              setLeadsPage(page);
              setLeadsPageSize(size);
            },
          }}
          locale={{ emptyText: "No leads yet" }}
          size="middle"
          onRow={(record) => ({
            onClick: () => openEditLeadDrawer(record as Lead),
            style: { cursor: "pointer" },
          })}
        />
      </Card>

      <Drawer
        title="Edit Lead"
        placement="right"
        width={LEAD_DRAWER_WIDTH}
        open={leadDrawerOpen}
        onClose={closeLeadDrawer}
        destroyOnClose={false}
        styles={{ body: LEAD_DRAWER_BODY_STYLE }}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <Button
              icon={<LeftOutlined />}
              onClick={handlePreviousLead}
              disabled={!getDrawerLeadContext().prevLead}
            >
              Previous
            </Button>
            <Space size="middle">
              <Button onClick={closeLeadDrawer}>Cancel</Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingDrawer}
                onClick={() => handleDrawerSave(false)}
              >
                Save
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingDrawer}
                onClick={() => handleDrawerSave(true)}
              >
                Save and Continue
              </Button>
            </Space>
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

      <Modal
        title="Upload Leads (CSV or Excel)"
        open={uploadModalOpen}
        onCancel={() => {
          setUploadModalOpen(false);
          setUploadFile(null);
          setParsedLeads([]);
        }}
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
          beforeUpload={(file) => {
            handleUploadFile(file);
            return false;
          }}
          fileList={uploadFile ? [{ uid: "1", name: uploadFile.name, status: "done" }] : []}
          onRemove={() => {
            setUploadFile(null);
            setParsedLeads([]);
          }}
          maxCount={1}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 48, color: "#4f46e5" }} />
          </p>
          <p className="ant-upload-text">Click or drag CSV or Excel file here</p>
          <p className="ant-upload-hint">
            Export as Excel, edit QA status/comments (keep the lead_id or id column), then re-upload.
            Your QA name and audit time are saved automatically on rows with QA audit fields.
          </p>
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
            Assign Agents to Campaign
          </span>
        }
        open={assignModalOpen}
        onCancel={() => setAssignModalOpen(false)}
        onOk={handleAssignAgents}
        confirmLoading={assigning}
        okText={
          selectedAgentIds.length > 0
            ? `Assign ${selectedAgentIds.length} agent${selectedAgentIds.length === 1 ? "" : "s"}`
            : "Save (no agents)"
        }
        width={560}
      >
        <p style={{ marginBottom: 16, color: "#4b5563" }}>
          Move agents between lists to assign or unassign them from this campaign. Assigned
          agents can view and manage leads.
        </p>
        {assignDataLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spin size="large" tip="Loading agents..." />
          </div>
        ) : agents.length === 0 ? (
          <Empty
            image={<TeamOutlined style={{ fontSize: 48, color: "#d1d5db" }} />}
            description="No agents in your organization."
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
                {item.description && (
                  <span style={{ color: "#6b7280", marginLeft: 8 }}>({item.description})</span>
                )}
              </span>
            )}
            showSearch
            filterOption={(inputValue, item) =>
              (item.title?.toLowerCase() ?? "").includes(inputValue.toLowerCase()) ||
              (item.description?.toLowerCase() ?? "").includes(inputValue.toLowerCase())
            }
            listStyle={{ width: 240, height: 320 }}
            pagination
          />
        )}
      </Modal>

      <Modal
        title="Save & go to previous?"
        open={previousConfirmOpen}
        onCancel={() => {
          setPreviousConfirmOpen(false);
          (window as unknown as { __qa_prev_lead?: Lead })["__qa_prev_lead"] = undefined;
        }}
        onOk={handleConfirmPreviousSave}
        okText="Save & Previous"
      >
        You have unsaved changes. Save and open the previous lead?
      </Modal>
    </div>
  );
}
