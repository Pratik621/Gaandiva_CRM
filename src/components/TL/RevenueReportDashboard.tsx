"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
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
  DollarOutlined,
  FundProjectionScreenOutlined,
  RiseOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  BarChartOutlined,
  CloseCircleOutlined,
  LineChartOutlined,
} from "@ant-design/icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
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
import type { RevenueReportCampaignRow, RevenueReportClientGroup } from "@/lib/revenue-report/query";
import {
  REVENUE_PERIOD_OPTIONS,
  type RevenueReportPeriod,
  periodToDayjsRange,
  resolveRevenueReportPeriod,
} from "@/lib/revenue-report/period";
import { tableSerialNumber } from "@/lib/table-pagination";

const { RangePicker } = DatePicker;
const { Text } = Typography;

type RevenueSummary = {
  total_revenue: number;
  total_booked: number;
  total_pending_revenue: number;
  total_allocation: number;
  total_achieved: number;
  total_post_qa: number;
  total_leads_rejected: number;
  avg_cpl: number | null;
};

type ChartPoint = { name: string; revenue: number };
type MonthlyPoint = { month: string; revenue: number };

type FilterOptions = {
  statuses: string[];
  lead_types: string[];
  channels: string[];
  campaign_types: string[];
  clients: string[];
  team_leaders: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
};

type RevenueReportResponse = {
  clients: RevenueReportClientGroup[];
  campaigns: RevenueReportCampaignRow[];
  summary: RevenueSummary;
  charts: {
    revenueByCampaign: ChartPoint[];
    revenueByTeamLeader: ChartPoint[];
    revenueByLeadType: ChartPoint[];
    monthlyRevenueTrend: MonthlyPoint[];
  };
  filterOptions?: FilterOptions;
  period?: {
    period: RevenueReportPeriod;
    date_from: string;
    date_to: string;
    label: string;
  };
  pagination?: { page: number; limit: number; total: number; totalPages: number };
};

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
} as const;

const kpiCards = [
  { key: "total_revenue", label: "Total Revenue", icon: <DollarOutlined />, color: "#4f46e5", format: "currency" },
  { key: "total_booked", label: "Total Booked", icon: <CheckCircleOutlined />, color: "#52c41a", format: "currency" },
  { key: "total_pending_revenue", label: "Pending Revenue", icon: <ClockCircleOutlined />, color: "#f59e0b", format: "currency" },
  { key: "total_allocation", label: "Total Allocation", icon: <FundProjectionScreenOutlined />, color: "#722ed1", format: "number" },
  { key: "total_achieved", label: "Total Achieved", icon: <RiseOutlined />, color: "#13c2c2", format: "number" },
  { key: "total_post_qa", label: "Total Post QA", icon: <TeamOutlined />, color: "#4f46e5", format: "number" },
  { key: "total_leads_rejected", label: "Leads Rejected", icon: <CloseCircleOutlined />, color: "#ef4444", format: "number" },
  { key: "avg_cpl", label: "Avg CPL", icon: <BarChartOutlined />, color: "#eb2f96", format: "currency" },
] as const;

function formatKpiValue(
  key: (typeof kpiCards)[number]["key"],
  summary: RevenueSummary | undefined
): string {
  if (!summary) return "—";
  const value = summary[key];
  if (value == null) return "—";
  if (
    key === "avg_cpl" ||
    key === "total_revenue" ||
    key === "total_booked" ||
    key === "total_pending_revenue"
  ) {
    return formatCurrency(value as number);
  }
  return Number(value).toLocaleString("en-US");
}

const STATUS_COLORS: Record<string, string> = {
  active: "green",
  completed: "success",
  paused: "orange",
  draft: "default",
};

const STATUS_FILTER_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Pause" },
  { value: "completed", label: "Completed" },
];

function uniqueColumnFilters(
  rows: RevenueReportCampaignRow[],
  getValue: (row: RevenueReportCampaignRow) => string | null | undefined
): { text: string; value: string }[] {
  const seen = new Set<string>();
  const filters: { text: string; value: string }[] = [];
  for (const row of rows) {
    const value = getValue(row)?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    filters.push({ text: value, value });
  }
  return filters.sort((a, b) => a.text.localeCompare(b.text));
}

function compareNullableStrings(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  return (a ?? "").localeCompare(b ?? "");
}

function compareNullableNumbers(
  a: number | null | undefined,
  b: number | null | undefined
): number {
  return (a ?? 0) - (b ?? 0);
}

function buildCampaignColumns(
  campaigns: RevenueReportCampaignRow[]
): ColumnsType<RevenueReportCampaignRow> {
  const ownerFilters = uniqueColumnFilters(campaigns, (r) => r.campaign_owner);
  const channelFilters = uniqueColumnFilters(campaigns, (r) => r.channel);
  const aggregatorFilters = uniqueColumnFilters(campaigns, (r) => r.aggregator);
  const leadTypeFilters = uniqueColumnFilters(campaigns, (r) => r.lead_type);
  const regionFilters = uniqueColumnFilters(campaigns, (r) => r.geography);

  return [
    {
      title: "Campaign Owner",
      key: "campaign_owner",
      width: 160,
      ellipsis: true,
      sorter: (a, b) => compareNullableStrings(a.campaign_owner, b.campaign_owner),
      filters: ownerFilters.length > 1 ? ownerFilters : undefined,
      onFilter: (value, record) => (record.campaign_owner?.trim() ?? "") === String(value),
      render: (_v, r) => {
        const owner = r.campaign_owner?.trim() || "—";
        const tl = r.assigned_team_leader_name?.trim();
        if (!tl) return owner;
        return (
          <div>
            <div>{owner}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              TL: {tl}
            </Text>
          </div>
        );
      },
    },
    {
      title: "Channel",
      dataIndex: "channel",
      key: "channel",
      width: 110,
      sorter: (a, b) => compareNullableStrings(a.channel, b.channel),
      filters: channelFilters.length > 1 ? channelFilters : undefined,
      onFilter: (value, record) => (record.channel?.trim() ?? "") === String(value),
    },
    {
      title: "Aggregator",
      dataIndex: "aggregator",
      key: "aggregator",
      width: 110,
      ellipsis: true,
      sorter: (a, b) => compareNullableStrings(a.aggregator, b.aggregator),
      filters: aggregatorFilters.length > 1 ? aggregatorFilters : undefined,
      onFilter: (value, record) => (record.aggregator?.trim() ?? "") === String(value),
    },
    {
      title: "Campaign Name",
      dataIndex: "name",
      key: "name",
      width: 180,
      ellipsis: true,
      sorter: (a, b) => compareNullableStrings(a.name, b.name),
    },
    {
      title: "Lead Type",
      dataIndex: "lead_type",
      key: "lead_type",
      width: 110,
      ellipsis: true,
      sorter: (a, b) => compareNullableStrings(a.lead_type, b.lead_type),
      filters: leadTypeFilters.length > 1 ? leadTypeFilters : undefined,
      onFilter: (value, record) => (record.lead_type?.trim() ?? "") === String(value),
    },
    {
      title: "Start Date",
      dataIndex: "start_date",
      key: "start_date",
      width: 110,
      sorter: (a, b) => compareNullableStrings(a.start_date, b.start_date),
    },
    {
      title: "End Date",
      dataIndex: "end_date",
      key: "end_date",
      width: 110,
      sorter: (a, b) => compareNullableStrings(a.end_date, b.end_date),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 100,
      sorter: (a, b) => compareNullableStrings(a.status, b.status),
      filters: STATUS_FILTER_OPTIONS.map((option) => ({
        text: option.label,
        value: option.value,
      })),
      onFilter: (value, record) => record.status === String(value),
      render: (status: string) => {
        const label =
          STATUS_FILTER_OPTIONS.find((o) => o.value === status)?.label ??
          (status === "paused" ? "Pause" : status);
        return <Tag color={STATUS_COLORS[status] ?? "default"}>{label}</Tag>;
      },
    },
    {
      title: "CPL",
      key: "cpl",
      width: 90,
      sorter: (a, b) => compareNullableNumbers(a.metrics.cpl, b.metrics.cpl),
      render: (_v, r) => formatCurrency(r.metrics.cpl),
    },
    {
      title: "Revenue",
      key: "revenue",
      width: 110,
      sorter: (a, b) => compareNullableNumbers(a.metrics.revenue, b.metrics.revenue),
      render: (_v, r) => formatCurrency(r.metrics.revenue),
    },
    {
      title: "Booked",
      key: "booked",
      width: 100,
      sorter: (a, b) => compareNullableNumbers(a.metrics.booked, b.metrics.booked),
      render: (_v, r) => formatCurrency(r.metrics.booked),
    },
    {
      title: "Pending Revenue",
      key: "pending_revenue",
      width: 130,
      sorter: (a, b) =>
        compareNullableNumbers(a.metrics.pending_revenue, b.metrics.pending_revenue),
      render: (_v, r) => formatCurrency(r.metrics.pending_revenue),
    },
    {
      title: "Total Allocation",
      key: "total_allocation",
      width: 120,
      sorter: (a, b) =>
        compareNullableNumbers(a.metrics.total_allocation, b.metrics.total_allocation),
      render: (_v, r) => r.metrics.total_allocation.toLocaleString("en-US"),
    },
    {
      title: "Post QA",
      key: "post_qa",
      width: 90,
      sorter: (a, b) => compareNullableNumbers(a.metrics.post_qa, b.metrics.post_qa),
      render: (_v, r) => r.metrics.post_qa.toLocaleString("en-US"),
    },
    {
      title: "Achieved",
      key: "achieved",
      width: 90,
      sorter: (a, b) => compareNullableNumbers(a.metrics.achieved, b.metrics.achieved),
      render: (_v, r) =>
        r.metrics.achieved != null ? r.metrics.achieved.toLocaleString("en-US") : "—",
    },
    {
      title: "Pending Allocation",
      key: "pending_allocation",
      width: 130,
      sorter: (a, b) =>
        compareNullableNumbers(a.metrics.pending_allocation, b.metrics.pending_allocation),
      render: (_v, r) => r.metrics.pending_allocation ?? "—",
    },
    {
      title: "Leads Rejected",
      key: "leads_rejected",
      width: 120,
      sorter: (a, b) =>
        compareNullableNumbers(a.metrics.leads_rejected, b.metrics.leads_rejected),
      render: (_v, r) => r.metrics.leads_rejected.toLocaleString("en-US"),
    },
    {
      title: "Region",
      dataIndex: "geography",
      key: "geography",
      width: 110,
      ellipsis: true,
      sorter: (a, b) => compareNullableStrings(a.geography, b.geography),
      filters: regionFilters.length > 1 ? regionFilters : undefined,
      onFilter: (value, record) => (record.geography?.trim() ?? "") === String(value),
    },
    {
      title: "CPC",
      key: "cpc",
      width: 90,
      sorter: (a, b) => compareNullableNumbers(a.metrics.cpc, b.metrics.cpc),
      render: (_v, r) => formatCurrency(r.metrics.cpc),
    },
    {
      title: "Weekly Call",
      dataIndex: "weekly_call",
      key: "weekly_call",
      width: 110,
      ellipsis: true,
    },
    {
      title: "Weekly Report",
      dataIndex: "weekly_report",
      key: "weekly_report",
      width: 110,
      ellipsis: true,
    },
    {
      title: "Additional Comments",
      dataIndex: "additional_comments",
      key: "additional_comments",
      width: 160,
      ellipsis: true,
    },
  ];
}

function CampaignRevenueTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div
      style={{
        background: "#fff",
        padding: "10px 14px",
        border: "1px solid #f0f0f0",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        maxWidth: 280,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, lineHeight: 1.4 }}>
        {row.name}
      </div>
      <div style={{ fontSize: 13, color: "#4f46e5", fontWeight: 600 }}>
        {formatCurrency(row.revenue)}
      </div>
    </div>
  );
}

function currentMonthRange(): [Dayjs, Dayjs] {
  return periodToDayjsRange(resolveRevenueReportPeriod("monthly"));
}

export default function RevenueReportDashboard() {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [leadTypeFilter, setLeadTypeFilter] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<string | null>(null);
  const [clientNameFilter, setClientNameFilter] = useState<string | null>(null);
  const [teamLeaderFilter, setTeamLeaderFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<RevenueReportPeriod>("monthly");
  const [customDateRange, setCustomDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(
    currentMonthRange()
  );
  const [sortBy, setSortBy] = useState<string>("start_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { page, pageSize, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination(25);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 400);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    resetPage();
  }, [
    debouncedSearch,
    statusFilter,
    leadTypeFilter,
    channelFilter,
    campaignTypeFilter,
    clientNameFilter,
    teamLeaderFilter,
    agentFilter,
    periodFilter,
    customDateRange,
    resetPage,
  ]);

  const listParams = useMemo(
    () => ({
      page,
      limit: pageSize,
      q: debouncedSearch || undefined,
      status: statusFilter || undefined,
      lead_type: leadTypeFilter || undefined,
      channel: channelFilter || undefined,
      campaign_type: campaignTypeFilter || undefined,
      client_name: clientNameFilter || undefined,
      team_leader_id: teamLeaderFilter || undefined,
      agent_id: agentFilter || undefined,
      period: periodFilter,
      period_from:
        periodFilter === "custom" ? customDateRange?.[0]?.format("YYYY-MM-DD") : undefined,
      period_to:
        periodFilter === "custom" ? customDateRange?.[1]?.format("YYYY-MM-DD") : undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [
      page,
      pageSize,
      debouncedSearch,
      statusFilter,
      leadTypeFilter,
      channelFilter,
      campaignTypeFilter,
      clientNameFilter,
      teamLeaderFilter,
      agentFilter,
      periodFilter,
      customDateRange,
      sortBy,
      sortDir,
    ]
  );

  const { items, pagination, response, isLoading, isFetching, error } =
    usePaginatedListQuery<RevenueReportClientGroup>({
      queryKeyPrefix: ["tl", "revenue-report"],
      url: "/api/tl/revenue-report",
      params: listParams,
      listField: "clients",
    });

  const report = response as RevenueReportResponse | undefined;
  const filterOptions = report?.filterOptions;

  useSyncListPaginationTotal(pagination, applyPaginationMeta);

  useEffect(() => {
    if (error) message.error(error.message || "Failed to load revenue report");
  }, [error]);

  const exportUrl = (format: "csv" | "excel") =>
    buildListApiUrl("/api/tl/revenue-report/export", {
      ...listParams,
      page: undefined,
      limit: undefined,
      format,
    });

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

  const clientColumns: ColumnsType<RevenueReportClientGroup> = [
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
      width: 120,
      fixed: "left",
      ellipsis: true,
      render: (code: string | null) => code?.trim() || "—",
    },
    {
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
    },
    {
      title: "Revenue",
      key: "revenue",
      width: 120,
      render: (_v, r) => formatCurrency(r.metrics.revenue),
    },
    {
      title: "Booked",
      key: "booked",
      width: 110,
      render: (_v, r) => formatCurrency(r.metrics.booked),
    },
    {
      title: "Pending Revenue",
      key: "pending_revenue",
      width: 130,
      render: (_v, r) => formatCurrency(r.metrics.pending_revenue),
    },
    {
      title: "Total Allocation",
      key: "total_allocation",
      width: 120,
      render: (_v, r) => r.metrics.total_allocation.toLocaleString("en-US"),
    },
    {
      title: "Achieved",
      key: "achieved",
      width: 100,
      render: (_v, r) =>
        r.metrics.achieved != null ? r.metrics.achieved.toLocaleString("en-US") : "—",
    },
    {
      title: "Post QA",
      key: "post_qa",
      width: 90,
      render: (_v, r) => r.metrics.post_qa.toLocaleString("en-US"),
    },
    {
      title: "Leads Rejected",
      key: "leads_rejected",
      width: 120,
      render: (_v, r) => r.metrics.leads_rejected.toLocaleString("en-US"),
    },
    {
      title: "Avg CPL",
      key: "avg_cpl",
      width: 100,
      render: (_v, r) => formatCurrency(r.metrics.cpl),
    },
  ];

  const summary = report?.summary;
  const charts = report?.charts;
  const loading = serverTableInitialLoading(isLoading, items.length);

  return (
    <Spin spinning={loading}>
      <Card style={{ ...cardStyle, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Period: <Text strong>{report?.period?.label ?? "This month"}</Text>
            {report?.period?.date_from && report?.period?.date_to && (
              <span>
                {" "}
                ({report.period.date_from} – {report.period.date_to})
              </span>
            )}
            {" · "}
            Revenue, Achieved, and Post QA reflect lead activity in this period. Booked, Total
            Allocation, and Pending Revenue include campaigns whose start date falls in this period
            (end date is ignored).
          </Text>
        </div>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Input
              allowClear
              placeholder="Search campaigns (name, client, code, industry…)"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
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
              placeholder="Channel"
              style={{ width: "100%" }}
              value={channelFilter}
              onChange={setChannelFilter}
              options={(filterOptions?.channels ?? []).map((s) => ({ value: s, label: s }))}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Select
              allowClear
              placeholder="Campaign Type"
              style={{ width: "100%" }}
              value={campaignTypeFilter}
              onChange={setCampaignTypeFilter}
              options={(filterOptions?.campaign_types ?? []).map((s) => ({ value: s, label: s }))}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Select
              allowClear
              showSearch
              placeholder="Client Name"
              style={{ width: "100%" }}
              value={clientNameFilter}
              onChange={setClientNameFilter}
              options={(filterOptions?.clients ?? []).map((s) => ({ value: s, label: s }))}
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
              showSearch
              placeholder="Agent"
              style={{ width: "100%" }}
              value={agentFilter}
              onChange={setAgentFilter}
              options={(filterOptions?.agents ?? []).map((a) => ({
                value: a.id,
                label: a.name,
              }))}
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Select
              style={{ width: "100%" }}
              value={periodFilter}
              onChange={(value: RevenueReportPeriod) => setPeriodFilter(value)}
              options={REVENUE_PERIOD_OPTIONS}
            />
          </Col>
          {periodFilter === "custom" && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <RangePicker
                allowClear={false}
                style={{ width: "100%" }}
                value={customDateRange}
                onChange={(vals) => setCustomDateRange(vals)}
              />
            </Col>
          )}
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {kpiCards.map((kpi) => (
          <Col xs={12} sm={12} md={6} lg={6} xl={6} key={kpi.key}>
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

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title="Revenue by Campaign"
            style={cardStyle}
            styles={{ body: { padding: "12px 8px 8px", height: 300 } }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={charts?.revenueByCampaign ?? []}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="6%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" hide />
                <YAxis tick={{ fontSize: 11 }} width={52} />
                <RechartsTooltip content={<CampaignRevenueTooltip />} cursor={{ fill: "rgba(79,70,229,0.06)" }} />
                <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="Revenue by Team Leader"
            style={cardStyle}
            styles={{ body: { padding: "12px 8px 8px", height: 300 } }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={charts?.revenueByTeamLeader ?? []}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="6%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" hide />
                <YAxis tick={{ fontSize: 11 }} width={52} />
                <RechartsTooltip content={<CampaignRevenueTooltip />} cursor={{ fill: "rgba(82,196,26,0.06)" }} />
                <Bar dataKey="revenue" fill="#52c41a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Revenue by Lead Type" style={cardStyle}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={charts?.revenueByLeadType ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="revenue" fill="#722ed1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <LineChartOutlined />
                Monthly Revenue Trend
              </Space>
            }
            style={cardStyle}
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={charts?.monthlyRevenueTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Card
        title="Client & Campaign Detail"
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
          scroll={{ x: 1400 }}
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
                columns={buildCampaignColumns(record.campaigns)}
                dataSource={record.campaigns}
                pagination={false}
                size="small"
                scroll={{ x: 2800 }}
              />
            ),
            rowExpandable: (record) => record.campaigns.length > 0,
          }}
        />
      </Card>
    </Spin>
  );
}
