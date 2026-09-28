"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  Tag,
  Tooltip,
  message,
  Spin,
  Typography,
  Popconfirm,
  Input,
  Select,
  Modal,
  Form,
} from "antd";
import {
  FundProjectionScreenOutlined,
  RiseOutlined,
  TeamOutlined,
  PlusOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { buildDefaultDuplicateCampaignName } from "@/lib/campaign/duplicate-campaign";
import { usePaginatedListQuery } from "@/hooks/usePaginatedListQuery";
import {
  serverTableInitialLoading,
  useServerTablePagination,
  useSyncListPaginationTotal,
} from "@/hooks/useServerTablePagination";
import { tableSerialNumber } from "@/lib/table-pagination";
import { formatEarnedRevenue } from "@/lib/campaign-revenue-metrics";

type CampaignRow = {
  id: string;
  campaign_id: string;
  campaign_code: string | null;
  name: string;
  client_name: string | null;
  lead_type: string | null;
  industry: string | null;
  geography: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  cpl: number | null;
  revenue: number | null;
  total_allocation: number | null;
  achieved: number | null;
  created_at: string;
  total_leads: number;
  assigned_team_leader_name: string | null;
};

type Stats = {
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
};

type ClientFilterOption = { id: string | null; name: string };

type CampaignsListResponse = {
  filterOptions?: {
    clients?: ClientFilterOption[];
  };
};

export default function SalesManagerCampaignsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasRole, isInitialized } = useAuth();
  const hasSalesAccess =
    hasRole("sales") || hasRole("sales_manager") || hasRole("admin");
  const canCompleteCampaign = hasRole("sales_manager") || hasRole("admin");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<CampaignRow | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const { page, pageSize, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 400);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, statusFilter, clientFilter, resetPage]);

  const listEnabled = isInitialized && hasSalesAccess;

  const statsQuery = useQuery({
    queryKey: ["sales", "campaigns", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/tl/campaigns/stats", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load stats");
      return data as Stats;
    },
    enabled: listEnabled,
  });

  const {
    items: campaigns,
    pagination,
    response,
    isLoading: campaignsLoading,
    error: campaignsError,
  } = usePaginatedListQuery<CampaignRow>({
    queryKeyPrefix: ["sales", "campaigns", "list"],
    url: "/api/tl/campaigns",
    params: {
      page,
      limit: pageSize,
      q: debouncedSearch || undefined,
      status: statusFilter || undefined,
      client_id: clientFilter?.startsWith("id:")
        ? clientFilter.slice(3)
        : undefined,
      client_name: clientFilter?.startsWith("name:")
        ? clientFilter.slice(5)
        : undefined,
    },
    listField: "campaigns",
    enabled: listEnabled,
  });

  const clientOptions =
    (response as CampaignsListResponse | undefined)?.filterOptions?.clients ?? [];

  useSyncListPaginationTotal(pagination, applyPaginationMeta);

  useEffect(() => {
    if (campaignsError) {
      message.error(
        campaignsError instanceof Error ? campaignsError.message : "Failed to load campaigns"
      );
    }
  }, [campaignsError]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasSalesAccess) {
      router.replace("/login");
    }
  }, [isInitialized, hasSalesAccess, router]);

  const loading =
    serverTableInitialLoading(campaignsLoading || statsQuery.isLoading, campaigns.length);
  const stats = statsQuery.data ?? null;

  const refreshLists = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["sales", "campaigns"] });
  }, [queryClient]);

  const handleStatusChange = async (id: string, newStatus: string) => {
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
      refreshLists();
    } catch {
      message.error("Failed to update campaign");
    }
  };

  const openDuplicateModal = (campaign: CampaignRow) => {
    setDuplicateTarget(campaign);
    setDuplicateName(buildDefaultDuplicateCampaignName(campaign.name));
  };

  const closeDuplicateModal = () => {
    setDuplicateTarget(null);
    setDuplicateName("");
  };

  const handleDuplicateConfirm = async () => {
    if (!duplicateTarget) return;
    const trimmed = duplicateName.trim();
    if (!trimmed) {
      message.error("Campaign name is required");
      return;
    }
    setDuplicating(true);
    try {
      const res = await fetch(`/api/tl/campaigns/${duplicateTarget.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to duplicate campaign");

      if (data.file_errors?.length) {
        message.warning(
          `Campaign duplicated. ${data.files_copied ?? 0} file(s) copied; some files could not be copied.`
        );
      } else {
        message.success("Campaign duplicated successfully");
      }
      closeDuplicateModal();
      refreshLists();
      if (data.campaign_id) {
        router.push(`/sales/campaigns/${data.campaign_id}`);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to duplicate campaign");
    } finally {
      setDuplicating(false);
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  if (!hasSalesAccess) {
    return null;
  }

  const statusOptions = [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "completed", label: "Completed" },
  ];

  const textCell = (v: string | null, fallback = "—") => {
    const t = (v ?? "").trim() || fallback;
    return (
      <Tooltip title={t}>
        <span className="table-text-ellipsis">{t}</span>
      </Tooltip>
    );
  };

  const columns = [
    {
      title: "Sr. No.",
      key: "sr",
      width: 72,
      fixed: "left" as const,
      render: (_: unknown, __: CampaignRow, index: number) =>
        tableSerialNumber(page, pageSize, index),
    },
    {
      title: "Campaign Code",
      dataIndex: "campaign_code",
      key: "campaign_code",
      width: 130,
      fixed: "left" as const,
      render: (val: string | null) => (
        <Tag color="blue" style={{ fontFamily: "monospace", fontSize: 12 }}>
          {val || "—"}
        </Tag>
      ),
    },
    {
      title: "Client Name",
      dataIndex: "client_name",
      key: "client_name",
      width: 130,
      ellipsis: true,
      render: (v: string | null) => textCell(v),
    },
    {
      title: "Campaign Name",
      dataIndex: "name",
      key: "name",
      width: 160,
      ellipsis: true,
      render: (val: string, r: CampaignRow) => (
        <Tooltip title={val || "—"}>
          <span className="table-text-ellipsis">
            <Link href={`/sales/campaigns/${r.id}`} style={{ fontWeight: 600 }}>
              {val}
            </Link>
          </span>
        </Tooltip>
      ),
    },
    {
      title: "Lead Type",
      dataIndex: "lead_type",
      key: "lead_type",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => textCell(v),
    },
    {
      title: "Industry",
      dataIndex: "industry",
      key: "industry",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => textCell(v),
    },
    {
      title: "Geography",
      dataIndex: "geography",
      key: "geography",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => textCell(v),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 100,
      ellipsis: true,
      render: (val: string) => {
        const colors: Record<string, string> = {
          draft: "default",
          active: "green",
          paused: "orange",
          completed: "success",
        };
        const label = val ? val.charAt(0).toUpperCase() + val.slice(1).toLowerCase() : val;
        return (
          <span className="table-text-ellipsis">
            <Tag color={colors[val] ?? "default"}>{label}</Tag>
          </span>
        );
      },
    },
    { title: "Total Leads", dataIndex: "total_leads", key: "total_leads", width: 100 },
    {
      title: "Team Leader",
      dataIndex: "assigned_team_leader_name",
      key: "assigned_team_leader_name",
      width: 130,
      ellipsis: true,
      render: (v: string | null) => textCell(v),
    },
    {
      title: "Start Date",
      dataIndex: "start_date",
      key: "start_date",
      width: 100,
      render: (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—"),
    },
    {
      title: "CPL",
      dataIndex: "cpl",
      key: "cpl",
      width: 80,
      render: (v: number | null) => (v != null ? `$${v}` : "—"),
    },
    {
      title: "Revenue",
      key: "revenue",
      width: 100,
      render: (_: unknown, row: CampaignRow) => formatEarnedRevenue(row.cpl, row.achieved),
    },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      width: 110,
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: "Actions",
      key: "actions",
      width: 180,
      fixed: "right" as const,
      render: (_: unknown, r: CampaignRow) => (
        <div className="table-actions-cell" style={{ display: "flex", gap: 8, flexWrap: "nowrap" }}>
          <Tooltip title="View">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => router.push(`/sales/campaigns/${r.id}`)}
            />
          </Tooltip>
          <Tooltip title="Duplicate">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => openDuplicateModal(r)}
            />
          </Tooltip>
          {r.status === "draft" || r.status === "paused" ? (
            <Tooltip title="Activate">
              <Button
                type="text"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleStatusChange(r.id, "active")}
              />
            </Tooltip>
          ) : r.status === "active" ? (
            <Tooltip title="Pause">
              <Button
                type="text"
                size="small"
                icon={<PauseCircleOutlined />}
                onClick={() => handleStatusChange(r.id, "paused")}
              />
            </Tooltip>
          ) : r.status === "completed" ? (
            <Tooltip title="Completed">
              <Button
                type="text"
                size="small"
                icon={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
                tabIndex={-1}
                style={{ cursor: "default" }}
              />
            </Tooltip>
          ) : null}
          {canCompleteCampaign && (r.status === "active" || r.status === "paused") ? (
            <Tooltip title="Mark completed">
              <Popconfirm
                title="Mark campaign as completed?"
                description="This will set the campaign status to Completed across the system."
                onConfirm={() => handleStatusChange(r.id, "completed")}
                okText="Completed"
              >
                <Button type="text" size="small" icon={<CheckCircleOutlined />} />
              </Popconfirm>
            </Tooltip>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Campaigns
          </Typography.Title>
          <Typography.Text type="secondary">
            Manage campaigns with full CRUD
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/sales/campaigns/create")}>
          Create Campaign
        </Button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="Total Campaigns"
                  value={stats?.totalCampaigns ?? 0}
                  prefix={<FundProjectionScreenOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="Active Campaigns"
                  value={stats?.activeCampaigns ?? 0}
                  prefix={<RiseOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="Total Leads"
                  value={stats?.totalLeads ?? 0}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
          </Row>

          <Card
            title="All Campaigns"
            bodyStyle={{ overflowX: "auto" }}
            extra={
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <Input
                  placeholder="Search campaigns..."
                  prefix={<SearchOutlined style={{ color: "#9ca3af" }} />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                  style={{ width: 220 }}
                />
                <Select
                  placeholder="Filter by status"
                  allowClear
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOptions}
                  style={{ width: 160 }}
                />
                <Select
                  placeholder="Filter by client"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={clientFilter}
                  onChange={setClientFilter}
                  options={clientOptions.map((c) => ({
                    value: c.id ? `id:${c.id}` : `name:${c.name}`,
                    label: c.name,
                  }))}
                  style={{ width: 220 }}
                />
              </div>
            }
          >
            <Table
              className="table-single-line"
              columns={columns}
              dataSource={campaigns}
              rowKey="id"
              scroll={{ x: 1920 }}
              pagination={tablePagination}
              locale={{
                emptyText:
                  debouncedSearch || statusFilter || clientFilter
                    ? "No campaigns match the filter."
                    : "No campaigns yet. Create your first campaign.",
              }}
              tableLayout="fixed"
            />
          </Card>
        </>
      )}

      <Modal
        title="Duplicate campaign"
        open={duplicateTarget != null}
        onCancel={closeDuplicateModal}
        onOk={handleDuplicateConfirm}
        okText="Create duplicate"
        confirmLoading={duplicating}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Copies campaign settings, client, creatives, and files. Leads and team/agent
          assignments are not copied.
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label="Campaign name" required style={{ marginBottom: 0 }}>
            <Input
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="Enter campaign name"
              maxLength={255}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
