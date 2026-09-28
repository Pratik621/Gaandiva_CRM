"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  PAGINATION_SYNC_TOTAL_ONLY,
  useServerTablePagination,
} from "@/hooks/useServerTablePagination";
import { buildListApiUrl } from "@/lib/build-list-api-url";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  Button,
  Table,
  Tag,
  message,
  Spin,
  Typography,
  Popconfirm,
  Row,
  Col,
  Space,
} from "antd";
import {
  ArrowLeftOutlined,
  CopyOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  FileOutlined,
  DownloadOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { hasCampaignFeedRole } from "@/lib/command/campaign-feed-access";
import { CampaignFeedChatWidget } from "@/components/command/CampaignFeedChatWidget";
import { useCampaignFeedUnread } from "@/hooks/useCampaignFeedUnread";
import CampaignFeedTab from "@/components/command/CampaignFeedTab";
import { ExpandableText, renderExpandableOverviewValue } from "@/components/ExpandableText";
import { campaignHeaderDisplayCode } from "@/lib/campaign-display";
import { CampaignDetailsCard } from "@/components/Campaigns/CampaignDetailsCard";
import { tableSerialNumber } from "@/lib/table-pagination";
import { formatEarnedRevenue } from "@/lib/campaign-revenue-metrics";

type Campaign = {
  id: string;
  campaign_id: string;
  campaign_code?: string | null;
  name: string;
  client_name: string | null;
  description: string | null;
  industry: string | null;
  geography: string | null;
  target_designation: string | null;
  lead_type: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  cpl: number | null;
  revenue: number | null;
  booked: number | null;
  total_allocation: number | null;
  post_qa: number | null;
  achieved: number | null;
  pending_allocation: number | null;
  weekly_call: string | null;
  weekly_report: string | null;
  additional_comments: string | null;
  assigned_team_leader_id: string | null;
  employee_size: string[] | null;
  revenue_size: string[] | null;
  abm: boolean | null;
  seniority: string | null;
  job_function: string | null;
  creatives_url: string[] | null;
  campaign_questions?: unknown;
};

type Lead = {
  id: string;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: string;
  followup_date: string | null;
  notes: string | null;
  assigned_agent_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_agent_name: string | null;
  created_by_name: string | null;
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

export default function SalesManagerCampaignDetailView() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const { hasRole, isInitialized, roles } = useAuth();
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
  const hasSalesAccess =
    hasRole("sales") || hasRole("sales_manager") || hasRole("admin");
  const canCompleteCampaign = hasRole("sales_manager") || hasRole("admin");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [files, setFiles] = useState<CampaignFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamLeaders, setTeamLeaders] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const { page, pageSize, total, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination();
  const initialLeadsLoadDoneRef = useRef(false);
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    initialLeadsLoadDoneRef.current = false;
    resetPage();
  }, [id, resetPage]);

  useEffect(() => {
    if (id && hasSalesAccess) {
      fetch("/api/tl/team-leaders", { credentials: "include" })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) return;
          setTeamLeaders(data.team_leaders ?? []);
        })
        .catch(() => {});
    }
  }, [id, hasSalesAccess]);

  const fetchCampaign = useCallback(async (campaignId: string) => {
    const silent = initialLeadsLoadDoneRef.current;
    initialLeadsLoadDoneRef.current = true;
    if (!silent) setLoading(true);
    try {
      const url = buildListApiUrl(`/api/tl/campaigns/${campaignId}`, { page, limit: pageSize });
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setCampaign(data.campaign);
      setLeads(data.leads ?? []);
      applyPaginationMeta(data.leads_pagination, PAGINATION_SYNC_TOTAL_ONLY);
      setFiles(data.files ?? []);
    } catch {
      message.error("Failed to load campaign");
      routerRef.current.replace("/sales/campaigns");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, pageSize, applyPaginationMeta]);

  useEffect(() => {
    if (!id) {
      router.replace("/sales/campaigns");
      return;
    }
    if (!isInitialized) return;
    if (!hasSalesAccess) {
      router.replace("/login");
      return;
    }
    fetchCampaign(id);
  }, [id, isInitialized, hasSalesAccess, router, fetchCampaign]);

  useEffect(() => {
    const tab = searchParams.get("tab")?.toLowerCase();
    if (tab === "feed" && showFeedTab) {
      setViewTab("feed");
      setFeedChatOpen(false);
    }
  }, [searchParams, showFeedTab]);

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/tl/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      message.success(
        newStatus === "completed" ? "Campaign marked as completed" : "Campaign updated"
      );
      fetchCampaign(id);
    } catch {
      message.error("Failed to update campaign");
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/tl/campaigns/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      message.success("Campaign deleted");
      router.replace("/sales/campaigns");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete campaign");
    }
  };

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

  const leadColumns = [
    {
      title: "Sr. No.",
      key: "sr",
      width: 72,
      fixed: "left" as const,
      render: (_: unknown, __: Lead, index: number) =>
        tableSerialNumber(page, pageSize, index),
    },
    {
      title: "Lead ID",
      dataIndex: "lead_id",
      key: "lead_id",
      width: 160,
      fixed: "left" as const,
      render: (v: string | null) => {
        const id = v || "";
        if (!id) return "—";
        const copy = (e: React.MouseEvent) => {
          e.stopPropagation();
          navigator.clipboard.writeText(id).then(
            () => message.success("Lead ID copied"),
            () => message.error("Failed to copy")
          );
        };
        return (
          <span
            className="lead-id-cell"
            style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", minWidth: 0 }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
              }}
            >
              {id}
            </span>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined style={{ fontSize: 12 }} />}
              onClick={copy}
              className="lead-id-copy-btn"
              style={{ padding: "0 4px", minWidth: 24, height: 22, flexShrink: 0 }}
              title="Copy Lead ID"
            />
          </span>
        );
      },
    },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ellipsis: true, render: (v: string | null) => v || "—" },
    { title: "Company", dataIndex: "company_name", key: "company_name", width: 140, ellipsis: true, render: (v: string | null) => v || "—" },
    { title: "Phone", dataIndex: "phone", key: "phone", width: 120, render: (v: string | null) => <span className="lead-phone-cell" data-no-dialer="true">{v || "—"}</span> },
    { title: "Email", dataIndex: "email", key: "email", width: 160, ellipsis: true, render: (v: string | null) => v || "—" },
    {
      title: "City",
      dataIndex: "city",
      key: "city",
      width: 100,
      ellipsis: true,
      render: (v: string | null) => (
        <span className="table-text-ellipsis" title={v || "—"}>
          {v || "—"}
        </span>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (v: string) => <Tag style={{ textTransform: "capitalize" }}>{v?.replace("_", " ")}</Tag>,
    },
    {
      title: "Follow-up",
      dataIndex: "followup_date",
      key: "followup_date",
      width: 100,
      render: (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—"),
    },
    { title: "Notes", dataIndex: "notes", key: "notes", width: 140, ellipsis: true, render: (v: string | null) => v || "—" },
    {
      title: "Created By (Agent)",
      dataIndex: "created_by_name",
      key: "created_by_name",
      width: 140,
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      width: 110,
      render: (v: string) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"),
    },
  ];

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
      {/* Breadcrumb & back */}
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

      {/* Hero header */}
      <Card
        style={{
          marginBottom: 24,
          borderRadius: 8,
          border: "1px solid #f0f0f0",
          boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        }}
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
            {campaign.client_name && (
              <Typography.Text type="secondary" style={{ fontSize: 15, display: "block", marginBottom: 8 }}>
                {campaign.client_name}
              </Typography.Text>
            )}
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
            <Space size="small" wrap>
              <Button icon={<EditOutlined />} onClick={() => router.push(`/sales/campaigns/create?id=${id}`)}>
                Edit
              </Button>
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
              {canCompleteCampaign &&
                (campaign.status === "active" || campaign.status === "paused") && (
                  <Popconfirm
                    title="Mark campaign as completed?"
                    description="This will set the campaign status to Completed across the system."
                    onConfirm={() => handleStatusChange("completed")}
                    okText="Completed"
                  >
                    <Button icon={<CheckCircleOutlined />}>Completed</Button>
                  </Popconfirm>
                )}
              <Popconfirm
                title="Delete campaign?"
                description="This action cannot be undone."
                onConfirm={handleDelete}
                okText="Delete"
                okType="danger"
              >
                <Button danger icon={<DeleteOutlined />}>
                  Delete
                </Button>
              </Popconfirm>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Campaign details – grouped sections */}
      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Card
            title="Overview"
            style={{
              marginBottom: 24,
              borderRadius: 8,
              border: "1px solid #f0f0f0",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
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
        </Col>

        <Col xs={24} lg={10}>
          <CampaignDetailsCard
            rows={[
              {
                label: "Campaign Code",
                value: headerCode?.text ?? campaign.campaign_id,
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
                label: "Assigned Team Leader",
                value:
                  campaign.assigned_team_leader_id
                    ? teamLeaders.find((tl) => tl.id === campaign.assigned_team_leader_id)?.full_name ||
                      teamLeaders.find((tl) => tl.id === campaign.assigned_team_leader_id)?.email
                    : null,
              },
              {
                label: "CPL",
                value: campaign.cpl != null ? `$${Number(campaign.cpl).toLocaleString()}` : null,
              },
              {
                label: "Revenue",
                value: formatEarnedRevenue(campaign.cpl, campaign.achieved),
              },
              {
                label: "Booked",
                value: campaign.booked != null ? `$${Number(campaign.booked).toLocaleString()}` : null,
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
            style={{
              marginBottom: 24,
              borderRadius: 8,
              border: "1px solid #f0f0f0",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
            bodyStyle={{ padding: "24px 28px" }}
          >
            {files.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px 16px",
                  color: "#6b7280",
                  fontSize: 14,
                }}
              >
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
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <FileOutlined style={{ color: "#6b7280", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.file_name}
                      </span>
                      {f.file_size != null && (
                        <Typography.Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                          {(f.file_size / 1024).toFixed(1)} KB
                        </Typography.Text>
                      )}
                    </span>
                    {f.download_url && (
                      <Button
                        type="link"
                        size="small"
                        icon={<DownloadOutlined />}
                        href={f.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ padding: "0 4px", flexShrink: 0 }}
                      >
                        Download
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Leads table */}
      <Card
        title={`Leads (${total})`}
        style={{
          borderRadius: 8,
          border: "1px solid #f0f0f0",
          boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        }}
        bodyStyle={{ padding: "24px 28px" }}
      >
        <Table
          className="table-single-line"
          columns={leadColumns}
          dataSource={leads}
          rowKey="id"
          scroll={{ x: 1500 }}
          pagination={{
            ...tablePagination,
            showTotal: (t) => `Total ${t} leads`,
          }}
          locale={{ emptyText: "No leads yet" }}
          size="middle"
        />
      </Card>
        </>
      )}

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
