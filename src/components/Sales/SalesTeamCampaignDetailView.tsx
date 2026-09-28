"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  PAGINATION_SYNC_TOTAL_ONLY,
  serverTableInitialLoading,
  useServerTablePagination,
} from "@/hooks/useServerTablePagination";
import { buildListApiUrl } from "@/lib/build-list-api-url";
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  LeftOutlined,
  SaveOutlined,
  DownloadOutlined,
  UploadOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
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
  rectified_leads_count?: number;
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

export default function SalesTeamCampaignDetailView() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string | undefined;
  const { hasRole, isInitialized } = useAuth();
  const isSalesAuthorized = isInitialized && (hasRole("sales") || hasRole("admin"));
  const canEditQaAudit = hasRole("qa") || hasRole("admin");
  const initialLeadsLoadDoneRef = useRef(false);
  const leadsFetchGenRef = useRef(0);
  const routerRef = useRef(router);
  routerRef.current = router;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [files, setFiles] = useState<CampaignFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [savingDrawer, setSavingDrawer] = useState(false);
  const [form] = Form.useForm();
  const [leadSearch, setLeadSearch] = useState("");
  const {
    page: leadsPage,
    pageSize: leadsPageSize,
    total: leadsTotal,
    applyPaginationMeta,
    resetPage: resetLeadsPage,
    tablePagination: leadsTablePagination,
  } = useServerTablePagination();
  const leadsPageRef = useRef(leadsPage);
  const leadsPageSizeRef = useRef(leadsPageSize);
  leadsPageRef.current = leadsPage;
  leadsPageSizeRef.current = leadsPageSize;
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [previousConfirmOpen, setPreviousConfirmOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<Record<string, unknown>[]>([]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshingLeads, setRefreshingLeads] = useState(false);
  const [markingDeliveredLeadId, setMarkingDeliveredLeadId] = useState<string | null>(null);

  const campaignQuestions = useMemo(
    () => normalizeCampaignQuestions(campaign?.campaign_questions),
    [campaign?.campaign_questions]
  );

  const loadCampaignLeads = useCallback(
    async (
      campaignId: string,
      options?: {
        silent?: boolean;
        page?: number;
        pageSize?: number;
        syncPageFromResponse?: boolean;
      }
    ) => {
      const silent = options?.silent ?? false;
      const page = options?.page ?? leadsPageRef.current;
      const limit = options?.pageSize ?? leadsPageSizeRef.current;
      const syncPageFromResponse = options?.syncPageFromResponse ?? !silent;
      const fetchGen = ++leadsFetchGenRef.current;

      if (silent) {
        setRefreshingLeads(true);
      } else {
        setLoading(true);
      }
      try {
        const url = buildListApiUrl(`/api/sales/campaigns/${campaignId}`, {
          page,
          limit,
        });
        const res = await fetch(url, { credentials: "include" });
        const data = await res.json();
        if (fetchGen !== leadsFetchGenRef.current) return false;
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setCampaign(data.campaign);
        setLeads(data.leads ?? []);
        setFiles(data.files ?? []);
        applyPaginationMeta(
          data.leads_pagination,
          syncPageFromResponse ? undefined : PAGINATION_SYNC_TOTAL_ONLY
        );
        return true;
      } catch (err) {
        if (fetchGen !== leadsFetchGenRef.current) return false;
        if (silent) {
          message.error(
            err instanceof Error ? err.message : "Failed to refresh leads"
          );
        } else {
          message.error("Failed to load campaign");
          routerRef.current.replace("/sales/campaigns");
        }
        return false;
      } finally {
        if (fetchGen !== leadsFetchGenRef.current) return;
        if (silent) {
          setRefreshingLeads(false);
        } else {
          setLoading(false);
        }
      }
    },
    [applyPaginationMeta]
  );

  useEffect(() => {
    initialLeadsLoadDoneRef.current = false;
    leadsFetchGenRef.current += 1;
    resetLeadsPage();
  }, [id, resetLeadsPage]);

  useEffect(() => {
    if (!id) {
      router.replace("/sales/campaigns");
      return;
    }
    if (!isInitialized) return;
    if (!isSalesAuthorized) {
      router.replace("/login");
      return;
    }
  }, [id, isInitialized, isSalesAuthorized, router]);

  useEffect(() => {
    if (!id || !isSalesAuthorized) return;

    const silent = initialLeadsLoadDoneRef.current;
    initialLeadsLoadDoneRef.current = true;

    void loadCampaignLeads(id, {
      silent,
      page: leadsPage,
      pageSize: leadsPageSize,
      syncPageFromResponse: false,
    });
  }, [id, isSalesAuthorized, leadsPage, leadsPageSize, loadCampaignLeads]);

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
    resetLeadsPage();
  }, [leadSearch, dateRange, resetLeadsPage]);

  const deliveredCount = leads.filter(
    (l) => (l.delivery_status ?? "not_delivered") === "delivered"
  ).length;

  const openEditLeadDrawer = useCallback((lead: Lead) => {
    setEditingLead(lead);
    form.setFieldsValue(leadToFormValues(lead as unknown as Record<string, unknown>));
    setLeadDrawerOpen(true);
  }, [form]);

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
        (window as unknown as { __sales_prev_lead?: Lead })["__sales_prev_lead"] = prevLead;
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
      const res = await fetch(`/api/sales/campaigns/${id}/leads`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update lead");
      message.success("Lead updated");
      await loadCampaignLeads(id, { silent: true });
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
    const prevLead = (window as unknown as { __sales_prev_lead?: Lead })["__sales_prev_lead"];
    setPreviousConfirmOpen(false);
    (window as unknown as { __sales_prev_lead?: Lead })["__sales_prev_lead"] = undefined;
    if (!prevLead) return;
    await handleDrawerSave(false);
    openEditLeadDrawer(prevLead);
  };

  const handleExport = async () => {
    if (!id) return;
    if (leadsTotal === 0) {
      message.warning("No leads to export");
      return;
    }
    setExporting(true);
    try {
      const url = buildListApiUrl(`/api/sales/campaigns/${id}`, { export: "all" });
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
    if (!id || parsedLeads.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/sales/campaigns/${id}/leads/import`, {
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
      void loadCampaignLeads(id, { silent: true });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleDeliveryStatusChange = useCallback(async (
    lead: Lead,
    nextStatus: "pending" | "not_delivered" | "delivered" | "client_rejected"
  ) => {
    if (!id) return;
    const currentStatus = lead.delivery_status ?? "pending";
    // Allow re-click when delivered but date or delivering user was never recorded (legacy backfill)
    const alreadyDelivered = currentStatus === "delivered";
    const missingDeliveryMeta = !lead.delivered_at || !lead.delivered_by;
    if (nextStatus === currentStatus && !(alreadyDelivered && missingDeliveryMeta)) {
      message.info("Delivery status is already set");
      return;
    }
    setMarkingDeliveredLeadId(lead.id);
    try {
      const res = await fetch(`/api/sales/campaigns/${id}/leads`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: lead.id, delivery_status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update delivery status");
      message.success(
        nextStatus === "delivered"
          ? alreadyDelivered
            ? "Delivery details recorded"
            : "Lead marked as delivered"
          : nextStatus === "not_delivered"
          ? "Lead marked as not delivered"
          : "Delivery status set to pending"
      );
      setLeads((prev) =>
        prev.map((row) => {
          if (row.id !== lead.id) return row;
          if (nextStatus === "delivered") {
            return {
              ...row,
              delivery_status: "delivered",
              delivered_at: row.delivered_at ?? new Date().toISOString(),
            };
          }
          return {
            ...row,
            delivery_status: nextStatus,
            delivered_at: null,
            delivered_by: null,
            delivered_by_name: null,
          };
        })
      );
      await loadCampaignLeads(id, { silent: true });
    } catch (e) {
      message.error(
        e instanceof Error ? e.message : "Failed to update delivery status"
      );
    } finally {
      setMarkingDeliveredLeadId(null);
    }
  }, [id, loadCampaignLeads]);

  const leadColumns = useMemo(
    () =>
      getLeadTableColumns({
        showActions: true,
        onEdit: openEditLeadDrawer,
        showDeliveryStatus: true,
        onDeliveryStatusChange: handleDeliveryStatusChange,
        markingDeliveredLeadId,
        pagination: { current: leadsPage, pageSize: leadsPageSize },
        showMeetingSetDate: false,
        showFollowupDate: false,
        showChannel: false,
        showAuditBy: true,
        showCreatedBy: true,
      }),
    [
      handleDeliveryStatusChange,
      id,
      leadsPage,
      leadsPageSize,
      loadCampaignLeads,
      markingDeliveredLeadId,
      openEditLeadDrawer,
    ]
  );

  if (!isInitialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!isSalesAuthorized) {
    return null;
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

  const headerCode = campaignHeaderDisplayCode(campaign);

  return (
    <div style={{ width: "100%", padding: "0 24px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/sales/campaigns"
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
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void loadCampaignLeads(id!, { silent: true })}
              loading={refreshingLeads}
            >
              Refresh
            </Button>
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
              { label: "Assigned Team Leader", value: campaign.assigned_team_leader_name },
              { label: "Total Allocation", value: campaign.total_allocation },
              { label: "Post QA", value: campaign.post_qa },
              { label: "Achieved", value: campaign.achieved },
              { label: "Rectified", value: campaign.rectified_leads_count },
              { label: "Pending Allocation", value: campaign.pending_allocation },
              { label: "Industry", value: campaign.industry },
            ]}
          />
          <CampaignFilesCard files={files} />
        </Col>
      </Row>

      <Card
        title={`Leads (${leadsTotal})`}
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
                  onClick={() => void handleExport()}
                  loading={exporting}
                  disabled={leadsTotal === 0 || exporting}
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
          Click a lead row to edit. Agent status = pipeline; QA status = your review outcome. Delivered on page: {deliveredCount}. Total leads: {leadsTotal}.
        </Typography.Text>
        <Table
          className="table-single-line"
          columns={leadColumns}
          dataSource={filteredLeads}
          rowKey="id"
          scroll={{ x: 2600 }}
          loading={serverTableInitialLoading(loading, leads.length)}
          pagination={leadsTablePagination}
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
            Export as Excel, edit (keep the lead_id or id column), then re-upload to update existing leads.
            Rows without an id are added as new leads. Imported leads are marked <strong>delivered</strong> by default
            (set delivery_status in the file to override).
          </p>
        </Upload.Dragger>
        {parsedLeads.length > 0 && (
          <Typography.Text style={{ display: "block", marginTop: 12, color: "#52c41a" }}>
            {parsedLeads.length} leads parsed and ready to import
          </Typography.Text>
        )}
      </Modal>

      <Modal
        title="Save & go to previous?"
        open={previousConfirmOpen}
        onCancel={() => {
          setPreviousConfirmOpen(false);
          (window as unknown as { __sales_prev_lead?: Lead })["__sales_prev_lead"] = undefined;
        }}
        onOk={handleConfirmPreviousSave}
        okText="Save & Previous"
      >
        You have unsaved changes. Save and open the previous lead?
      </Modal>
    </div>
  );
}
