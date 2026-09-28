"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Row,
  Col,
  Table,
  Input,
  Select,
  DatePicker,
  Button,
  Tag,
  Typography,
  message,
  Spin,
  Space,
} from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import {
  DownloadOutlined,
  FundProjectionScreenOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  RiseOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { usePaginatedListQuery } from "@/hooks/usePaginatedListQuery";
import {
  PAGINATION_SYNC_TOTAL_ONLY,
  serverTableInitialLoading,
  useServerTablePagination,
  useSyncListPaginationTotal,
} from "@/hooks/useServerTablePagination";
import { buildListApiUrl } from "@/lib/build-list-api-url";
import { buildPaginationMeta } from "@/lib/api-pagination";
import { formatCurrency } from "@/lib/campaign-revenue-metrics";
import type {
  CampaignTrackerSummary,
  RevenueReportCampaignRow,
  RevenueReportClientGroup,
} from "@/lib/campaign-tracker/query";
import { tableSerialNumber } from "@/lib/table-pagination";
import { useAuth } from "@/context/AuthContext";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

type FilterOptions = {
  statuses: string[];
  lead_types: string[];
  channels: string[];
  client_codes: string[];
  regions: string[];
  team_leaders: Array<{ id: string; name: string }>;
};

type CampaignTrackerResponse = {
  clients: RevenueReportClientGroup[];
  summary: CampaignTrackerSummary;
  filterOptions?: FilterOptions;
  date_range?: { date_from: string; date_to: string };
  pagination?: { page: number; limit: number; total: number; totalPages: number };
};

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
} as const;

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Pause" },
  { value: "completed", label: "Completed" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "draft", label: "Draft" },
];

const kpiCards = [
  {
    key: "total_campaigns",
    label: "Total Campaigns",
    icon: <FundProjectionScreenOutlined />,
    color: "#4f46e5",
  },
  {
    key: "active_campaigns",
    label: "Active Campaigns",
    icon: <CheckCircleOutlined />,
    color: "#52c41a",
  },
  {
    key: "paused_campaigns",
    label: "Paused Campaigns",
    icon: <PauseCircleOutlined />,
    color: "#f59e0b",
  },
  {
    key: "completed_campaigns",
    label: "Completed Campaigns",
    icon: <CheckCircleOutlined />,
    color: "#13c2c2",
  },
  {
    key: "total_allocation",
    label: "Total Allocation",
    icon: <FundProjectionScreenOutlined />,
    color: "#722ed1",
  },
  {
    key: "total_post_qa",
    label: "Total Post QA",
    icon: <TeamOutlined />,
    color: "#4f46e5",
  },
  {
    key: "total_achieved",
    label: "Total Achieved",
    icon: <RiseOutlined />,
    color: "#13c2c2",
  },
  {
    key: "total_pending_allocation",
    label: "Total Pending Allocation",
    icon: <ClockCircleOutlined />,
    color: "#f59e0b",
  },
  {
    key: "total_leads_rejected",
    label: "Total Leads Rejected",
    icon: <CloseCircleOutlined />,
    color: "#ef4444",
  },
] as const;

function formatKpiValue(
  key: (typeof kpiCards)[number]["key"],
  summary: CampaignTrackerSummary | undefined
): string {
  if (!summary) return "—";
  const value = summary[key];
  if (value == null) return "—";
  return Number(value).toLocaleString("en-US");
}

export default function CampaignTrackerDashboard() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const hideClientName = hasRole("qa_tl");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [clientCodeFilter, setClientCodeFilter] = useState<string | null>(null);
  const [teamLeaderFilter, setTeamLeaderFilter] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [campaignNameFilter, setCampaignNameFilter] = useState("");
  const [debouncedCampaignName, setDebouncedCampaignName] = useState("");
  const [leadTypeFilter, setLeadTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(3, "month"),
    dayjs(),
  ]);
  const [sortBy, setSortBy] = useState<string>("start_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const { page, pageSize, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 400);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCampaignName(campaignNameFilter.trim()), 400);
    return () => clearTimeout(t);
  }, [campaignNameFilter]);

  useEffect(() => {
    resetPage();
  }, [
    debouncedSearch,
    clientCodeFilter,
    teamLeaderFilter,
    channelFilter,
    debouncedCampaignName,
    leadTypeFilter,
    statusFilter,
    regionFilter,
    dateRange,
    resetPage,
  ]);

  const listParams = useMemo(
    () => ({
      page,
      limit: pageSize,
      q: debouncedSearch || undefined,
      client_code: clientCodeFilter || undefined,
      team_leader_id: teamLeaderFilter || undefined,
      channel: channelFilter || undefined,
      campaign_name: debouncedCampaignName || undefined,
      lead_type: leadTypeFilter || undefined,
      status: statusFilter || undefined,
      region: regionFilter || undefined,
      date_from: dateRange[0].format("YYYY-MM-DD"),
      date_to: dateRange[1].format("YYYY-MM-DD"),
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [
      page,
      pageSize,
      debouncedSearch,
      clientCodeFilter,
      teamLeaderFilter,
      channelFilter,
      debouncedCampaignName,
      leadTypeFilter,
      statusFilter,
      regionFilter,
      dateRange,
      sortBy,
      sortDir,
    ]
  );

  const { items, pagination, response, isLoading, isFetching, error, refetch } =
    usePaginatedListQuery<RevenueReportClientGroup>({
      queryKeyPrefix: ["qatl", "campaign-tracker"],
      url: "/api/qatl/campaign-tracker",
      params: listParams,
      listField: "clients",
    });

  const report = response as CampaignTrackerResponse | undefined;
  const filterOptions = report?.filterOptions;
  const summary = report?.summary;

  useSyncListPaginationTotal(pagination, applyPaginationMeta);

  useEffect(() => {
    if (error) message.error(error.message || "Failed to load campaign tracker");
  }, [error]);

  const exportUrl = (format: "csv" | "excel") =>
    buildListApiUrl("/api/qatl/campaign-tracker/export", {
      ...listParams,
      page: undefined,
      limit: undefined,
      format,
    });

  const handleStatusChange = async (campaignId: string, status: string) => {
    setUpdatingStatusId(campaignId);
    try {
      const res = await fetch(`/api/qatl/campaign-tracker/${campaignId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      message.success("Campaign status updated");
      await queryClient.invalidateQueries({ queryKey: ["qatl", "campaign-tracker"] });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleTableChange = (
    pag: TablePaginationConfig,
    _filters: unknown,
    sorter: SorterResult<RevenueReportClientGroup> | SorterResult<RevenueReportClientGroup>[]
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s?.field) {
      setSortBy(String(s.field));
      setSortDir(s.order === "ascend" ? "asc" : "desc");
    }
    if (pag.current) {
      const limit = pag.pageSize ?? pageSize;
      const total = pagination?.total ?? 0;
      applyPaginationMeta(buildPaginationMeta(pag.current, limit, total));
    }
  };

  const campaignColumns: ColumnsType<RevenueReportCampaignRow> = [
    {
      title: "Client Code",
      dataIndex: "client_code",
      key: "client_code",
      width: 110,
      ellipsis: true,
      render: (code: string | null) => code?.trim() || "—",
    },
    {
      title: "Team Leader",
      dataIndex: "assigned_team_leader_name",
      key: "assigned_team_leader_name",
      width: 140,
      ellipsis: true,
      render: (name: string | null) => name?.trim() || "—",
    },
    { title: "Channel", dataIndex: "channel", key: "channel", width: 110 },
    { title: "Campaign Name", dataIndex: "name", key: "name", width: 180, ellipsis: true },
    { title: "Lead Type", dataIndex: "lead_type", key: "lead_type", width: 110, ellipsis: true },
    { title: "Start Date", dataIndex: "start_date", key: "start_date", width: 110 },
    { title: "End Date", dataIndex: "end_date", key: "end_date", width: 110 },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (status: string, record) => (
        <Select
          size="small"
          style={{ width: 110 }}
          value={status}
          loading={updatingStatusId === record.id}
          disabled={updatingStatusId === record.id}
          options={STATUS_OPTIONS}
          onChange={(value) => handleStatusChange(record.id, value)}
        />
      ),
    },
    {
      title: "Total Allocation",
      key: "total_allocation",
      width: 120,
      sorter: true,
      render: (_v, r) => r.metrics.total_allocation.toLocaleString("en-US"),
    },
    {
      title: "Post QA",
      key: "post_qa",
      width: 90,
      sorter: true,
      render: (_v, r) => r.metrics.post_qa.toLocaleString("en-US"),
    },
    {
      title: "Achieved",
      key: "achieved",
      width: 90,
      sorter: true,
      render: (_v, r) =>
        r.metrics.achieved != null ? r.metrics.achieved.toLocaleString("en-US") : "—",
    },
    {
      title: "Pending Allocation",
      key: "pending_allocation",
      width: 130,
      render: (_v, r) => r.metrics.pending_allocation ?? "—",
    },
    {
      title: "Leads Rejected",
      key: "leads_rejected",
      width: 120,
      render: (_v, r) => r.metrics.leads_rejected.toLocaleString("en-US"),
    },
    { title: "Region", dataIndex: "geography", key: "geography", width: 110, ellipsis: true },
    {
      title: "CPC",
      key: "cpc",
      width: 90,
      render: (_v, r) => formatCurrency(r.metrics.cpc),
    },
    { title: "Weekly Call", dataIndex: "weekly_call", key: "weekly_call", width: 110, ellipsis: true },
    { title: "Weekly Report", dataIndex: "weekly_report", key: "weekly_report", width: 110, ellipsis: true },
    {
      title: "Additional Comments",
      dataIndex: "additional_comments",
      key: "additional_comments",
      width: 160,
      ellipsis: true,
    },
  ];

  const clientColumns: ColumnsType<RevenueReportClientGroup> = useMemo(() => {
    const columns: ColumnsType<RevenueReportClientGroup> = [
      {
        title: "#",
        key: "sn",
        width: 56,
        fixed: "left",
        render: (_v, _r, index) => tableSerialNumber(page, pageSize, index),
      },
      {
        title: "Client Code",
        dataIndex: "client_code",
        key: "client_code",
        width: hideClientName ? 180 : 120,
        fixed: "left",
        ellipsis: true,
        render: (code: string | null, record) => (
          <Space size={6}>
            <span>{code?.trim() || "—"}</span>
            {hideClientName ? (
              <Tag color="blue">
                {record.campaign_count} campaign{record.campaign_count === 1 ? "" : "s"}
              </Tag>
            ) : null}
          </Space>
        ),
      },
    ];

    if (!hideClientName) {
      columns.push({
        title: "Client Name",
        dataIndex: "client_name",
        key: "client_name",
        width: 220,
        fixed: "left",
        ellipsis: true,
        render: (name: string | null, record) => (
          <Space size={6}>
            <Text strong>{name?.trim() || "—"}</Text>
            <Tag color="blue">
              {record.campaign_count} campaign{record.campaign_count === 1 ? "" : "s"}
            </Tag>
          </Space>
        ),
      });
    }

    columns.push(
      {
        title: "Total Allocation",
        key: "total_allocation",
        width: 120,
        render: (_v, r) => r.metrics.total_allocation.toLocaleString("en-US"),
      },
      {
        title: "Post QA",
        key: "post_qa",
        width: 90,
        render: (_v, r) => r.metrics.post_qa.toLocaleString("en-US"),
      },
      {
        title: "Achieved",
        key: "achieved",
        width: 100,
        render: (_v, r) =>
          r.metrics.achieved != null ? r.metrics.achieved.toLocaleString("en-US") : "—",
      },
      {
        title: "Pending Allocation",
        key: "pending_allocation",
        width: 130,
        render: (_v, r) => r.metrics.pending_allocation ?? "—",
      },
      {
        title: "Leads Rejected",
        key: "leads_rejected",
        width: 120,
        render: (_v, r) => r.metrics.leads_rejected.toLocaleString("en-US"),
      }
    );

    return columns;
  }, [hideClientName, page, pageSize]);

  const loading = serverTableInitialLoading(isLoading, items.length);

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          Campaign Tracker
        </Title>
        <Text type="secondary">
          Track campaign progress, allocations, delivery performance, and manage status.
        </Text>
      </div>

      <Card style={{ ...cardStyle, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Input
              allowClear
              placeholder="Search campaigns…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Select
              allowClear
              showSearch
              placeholder="Client Code"
              style={{ width: "100%" }}
              value={clientCodeFilter}
              onChange={setClientCodeFilter}
              options={(filterOptions?.client_codes ?? []).map((s) => ({ value: s, label: s }))}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Select
              allowClear
              showSearch
              placeholder="Team Leader"
              style={{ width: "100%" }}
              value={teamLeaderFilter}
              onChange={setTeamLeaderFilter}
              options={(filterOptions?.team_leaders ?? []).map((t) => ({
                value: t.id,
                label: t.name,
              }))}
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Select
              allowClear
              placeholder="Channel"
              style={{ width: "100%" }}
              value={channelFilter}
              onChange={setChannelFilter}
              options={(filterOptions?.channels ?? []).map((s) => ({ value: s, label: s }))}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Input
              allowClear
              placeholder="Campaign Name"
              value={campaignNameFilter}
              onChange={(e) => setCampaignNameFilter(e.target.value)}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Select
              allowClear
              placeholder="Lead Type"
              style={{ width: "100%" }}
              value={leadTypeFilter}
              onChange={setLeadTypeFilter}
              options={(filterOptions?.lead_types ?? []).map((s) => ({ value: s, label: s }))}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Select
              allowClear
              placeholder="Status"
              style={{ width: "100%" }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_FILTER_OPTIONS}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Select
              allowClear
              showSearch
              placeholder="Region"
              style={{ width: "100%" }}
              value={regionFilter}
              onChange={setRegionFilter}
              options={(filterOptions?.regions ?? []).map((s) => ({ value: s, label: s }))}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <RangePicker
              allowClear={false}
              style={{ width: "100%" }}
              value={dateRange}
              format="DD MMM YYYY"
              onChange={(vals) => {
                if (vals?.[0] && vals?.[1]) setDateRange([vals[0], vals[1]]);
              }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Refresh
            </Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {kpiCards.map((kpi) => (
          <Col xs={12} sm={12} md={8} lg={8} xl={8} key={kpi.key}>
            <Card style={cardStyle} styles={{ body: { padding: "16px 18px" } }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: `${kpi.color}14`,
                    color: kpi.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                  }}
                >
                  {kpi.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {kpi.label}
                  </Text>
                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>
                    {formatKpiValue(kpi.key, summary)}
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title="Campaign Tracker"
        style={cardStyle}
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} href={exportUrl("csv")}>
              Export CSV
            </Button>
            <Button type="primary" icon={<DownloadOutlined />} href={exportUrl("excel")}>
              Export Excel
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="key"
          columns={clientColumns}
          dataSource={items}
          loading={isFetching && !loading}
          scroll={{ x: 1200 }}
          className="table-single-line qatl-campaigns-table"
          pagination={{
            ...tablePagination,
            ...PAGINATION_SYNC_TOTAL_ONLY,
          }}
          onChange={handleTableChange}
          size="small"
          expandable={{
            expandedRowRender: (record) => (
              <Table
                rowKey="id"
                columns={campaignColumns}
                dataSource={record.campaigns}
                pagination={false}
                size="small"
                scroll={{ x: 2600 }}
                className="table-single-line"
              />
            ),
            rowExpandable: (record) => record.campaigns.length > 0,
          }}
        />
      </Card>
    </Spin>
  );
}
