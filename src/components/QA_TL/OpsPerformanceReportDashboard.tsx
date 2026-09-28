"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Card,
  Row,
  Col,
  Table,
  Button,
  Typography,
  message,
  Spin,
  Tabs,
  Tag,
  Dropdown,
} from "antd";
import type { MenuProps } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import {
  ReloadOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  AuditOutlined,
  RiseOutlined,
  BarChartOutlined,
  FundProjectionScreenOutlined,
  EditOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCachedApiQuery } from "@/hooks/useCachedApiQuery";
import type {
  AgentConsolidatedRow,
  AgentDailyRow,
  OpsPerformanceReport,
  QaAuditorConsolidatedRow,
  QaAuditorDetailRow,
} from "@/lib/qatl/ops-performance-report";
import type { OpsReportFilterOptions } from "@/lib/qatl/ops-performance-filters";
import {
  downloadOpsReportTab,
  type OpsReportTabKey,
} from "@/lib/qatl/ops-performance-export";
import OpsPerformanceFilterBar, {
  type OpsReportUiFilters,
} from "@/components/QA_TL/OpsPerformanceFilterBar";

const { Text, Title } = Typography;

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
} as const;

const kpiCards = [
  { key: "total_leads", label: "Total Leads", icon: <FundProjectionScreenOutlined />, color: "#4f46e5" },
  { key: "qualified", label: "Qualified", icon: <CheckCircleOutlined />, color: "#52c41a" },
  { key: "disqualified", label: "Disqualified", icon: <CloseCircleOutlined />, color: "#ef4444" },
  { key: "rectified", label: "Rectified", icon: <EditOutlined />, color: "#722ed1" },
  { key: "tbd", label: "TBD", icon: <ClockCircleOutlined />, color: "#f59e0b" },
  { key: "qa_reviewed", label: "QA Reviewed", icon: <AuditOutlined />, color: "#13c2c2" },
  { key: "qa_qualified", label: "QA Qualified", icon: <RiseOutlined />, color: "#52c41a" },
  { key: "qa_disqualified", label: "QA Disqualified", icon: <CloseCircleOutlined />, color: "#ef4444" },
  { key: "qualified_pct", label: "Qualified %", icon: <BarChartOutlined />, color: "#4f46e5", suffix: "%" },
  { key: "disq_rate", label: "Disq Rate", icon: <CloseCircleOutlined />, color: "#ef4444", suffix: "%" },
] as const;

function formatKpi(
  key: (typeof kpiCards)[number]["key"],
  summary: OpsPerformanceReport["summary"] | undefined,
  suffix?: string
): string {
  if (!summary) return "—";
  const value = summary[key];
  if (value == null) return "—";
  if (suffix) return `${Number(value).toLocaleString("en-US")}${suffix}`;
  return Number(value).toLocaleString("en-US");
}

const COLOR_QUALIFIED = "#52c41a";
const COLOR_DISQUALIFIED = "#ef4444";

function coloredCount(value: number, color: string) {
  return (
    <Text strong style={{ color }}>
      {value.toLocaleString("en-US")}
    </Text>
  );
}

function coloredQualPct(value: number) {
  const color = value >= 50 ? COLOR_QUALIFIED : COLOR_DISQUALIFIED;
  return (
    <Text strong style={{ color }}>
      {value}%
    </Text>
  );
}

function outcomeColumns<T extends { qualified: number; disqualified: number; rectified: number; tbd: number; grand_total: number }>(
  extra: ColumnsType<T> = []
): ColumnsType<T> {
  return [
    ...extra,
    {
      title: "Qualified",
      dataIndex: "qualified",
      key: "qualified",
      width: 100,
      sorter: (a, b) => a.qualified - b.qualified,
      render: (v: number) => coloredCount(v, COLOR_QUALIFIED),
    },
    {
      title: "Disqualified",
      dataIndex: "disqualified",
      key: "disqualified",
      width: 110,
      sorter: (a, b) => a.disqualified - b.disqualified,
      render: (v: number) => coloredCount(v, COLOR_DISQUALIFIED),
    },
    {
      title: "Rectified",
      dataIndex: "rectified",
      key: "rectified",
      width: 100,
      sorter: (a, b) => a.rectified - b.rectified,
    },
    {
      title: "TBD",
      dataIndex: "tbd",
      key: "tbd",
      width: 80,
      sorter: (a, b) => a.tbd - b.tbd,
    },
    {
      title: "Grand Total",
      dataIndex: "grand_total",
      key: "grand_total",
      width: 110,
      sorter: (a, b) => a.grand_total - b.grand_total,
      render: (v: number) => <Text strong>{v.toLocaleString("en-US")}</Text>,
    },
  ];
}

const EMPTY_ROWS: never[] = [];

type ReportTableProps<T extends object> = {
  rowKey: string | ((record: T) => string);
  columns: ColumnsType<T>;
  dataSource: T[];
  scrollX: number;
  resetKey: string;
};

function ReportTable<T extends object>({
  rowKey,
  columns,
  dataSource,
  scrollX,
  resetKey,
}: ReportTableProps<T>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(dataSource.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [dataSource.length, page, pageSize]);

  const pagination = useMemo<TablePaginationConfig>(
    () => ({
      current: page,
      pageSize,
      total: dataSource.length,
      showSizeChanger: true,
      pageSizeOptions: ["10", "15", "20", "50", "100"],
      showTotal: (total) => `Total ${total}`,
      onChange: (nextPage, nextPageSize) => {
        setPage(nextPage);
        if (nextPageSize !== pageSize) setPageSize(nextPageSize);
      },
    }),
    [page, pageSize, dataSource.length]
  );

  return (
    <Table<T>
      rowKey={rowKey}
      columns={columns}
      dataSource={dataSource}
      size="small"
      scroll={{ x: scrollX }}
      className="table-single-line"
      pagination={pagination}
    />
  );
}

export default function OpsPerformanceReportDashboard() {
  const defaultFilters = useMemo<OpsReportUiFilters>(
    () => ({
      dateRange: [dayjs().subtract(1, "month"), dayjs()],
      startTime: dayjs().hour(0).minute(0).second(0),
      endTime: dayjs().hour(23).minute(59).second(0),
      tlIds: [],
      agentIds: [],
      campaignIds: [],
      leadTypes: [],
      regions: [],
      channels: [],
      qaStatuses: [],
    }),
    []
  );

  const [filters, setFilters] = useState<OpsReportUiFilters>(defaultFilters);
  const [activeTab, setActiveTab] = useState<OpsReportTabKey>("agent-daily");

  const clientTimeZone = useMemo(() => {
    if (typeof Intl === "undefined") return "UTC";
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, [defaultFilters]);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({
      start_date: filters.dateRange[0].format("YYYY-MM-DD"),
      end_date: filters.dateRange[1].format("YYYY-MM-DD"),
      start_time: filters.startTime.format("HH:mm"),
      end_time: filters.endTime.format("HH:mm"),
      tz: clientTimeZone,
    });
    const appendList = (key: string, values: string[]) => {
      if (values.length) params.set(key, values.join(","));
    };
    appendList("tl_ids", filters.tlIds);
    appendList("agent_ids", filters.agentIds);
    appendList("campaign_ids", filters.campaignIds);
    appendList("lead_types", filters.leadTypes);
    appendList("regions", filters.regions);
    appendList("channels", filters.channels);
    appendList("qa_statuses", filters.qaStatuses);
    return `/api/qatl/reports/ops-performance?${params.toString()}`;
  }, [filters, clientTimeZone]);

  const { data: filterOptions, isLoading: optionsLoading } =
    useCachedApiQuery<OpsReportFilterOptions>(
      ["qatl", "reports", "ops-performance", "filters"],
      "/api/qatl/reports/ops-performance/filters"
    );

  const { data, isLoading, isFetching, error, refetch } = useCachedApiQuery<OpsPerformanceReport>(
    ["qatl", "reports", "ops-performance", queryUrl],
    queryUrl
  );

  useEffect(() => {
    if (error) message.error(error.message || "Failed to load report");
  }, [error]);

  const summary = data?.summary;
  const charts = data?.charts;
  const tables = data?.tables;
  const agentDailyData = useMemo(() => tables?.agent_daily ?? EMPTY_ROWS, [tables?.agent_daily]);
  const agentConsolidatedData = useMemo(
    () => tables?.agent_consolidated ?? EMPTY_ROWS,
    [tables?.agent_consolidated]
  );
  const qaDetailData = useMemo(
    () => tables?.qa_auditor_detail ?? EMPTY_ROWS,
    [tables?.qa_auditor_detail]
  );
  const qaConsolidatedData = useMemo(
    () => tables?.qa_auditor_consolidated ?? EMPTY_ROWS,
    [tables?.qa_auditor_consolidated]
  );

  const agentDailyColumns: ColumnsType<AgentDailyRow> = useMemo(
    () =>
      outcomeColumns<AgentDailyRow>([
        {
          title: "Date",
          dataIndex: "date",
          key: "date",
          width: 120,
          fixed: "left",
          sorter: (a, b) => a.date.localeCompare(b.date),
          render: (d: string) => dayjs(d).format("DD MMM YYYY"),
        },
        {
          title: "Agent Name",
          dataIndex: "agent_name",
          key: "agent_name",
          width: 180,
          fixed: "left",
          ellipsis: true,
        },
      ]).map((col) =>
        col.key === "tbd"
          ? {
              ...col,
              title: "QA Pending",
              width: 110,
              render: (v: number) => coloredCount(v, "#f59e0b"),
            }
          : col
      ),
    []
  );

  const agentConsolidatedColumns: ColumnsType<AgentConsolidatedRow> = useMemo(
    () =>
      [
        ...outcomeColumns<AgentConsolidatedRow>([
          {
            title: "Agent Name",
            dataIndex: "agent_name",
            key: "agent_name",
            width: 200,
            fixed: "left",
            ellipsis: true,
          },
        ]),
        {
          title: "Qual %",
          dataIndex: "qual_pct",
          key: "qual_pct",
          width: 90,
          sorter: (a, b) => a.qual_pct - b.qual_pct,
          render: (v: number) => coloredQualPct(v),
        },
      ] as ColumnsType<AgentConsolidatedRow>,
    []
  );

  const qaDetailColumns: ColumnsType<QaAuditorDetailRow> = useMemo(
    () =>
      outcomeColumns<QaAuditorDetailRow>([
        {
          title: "QA Auditor",
          dataIndex: "qa_name",
          key: "qa_name",
          width: 160,
          fixed: "left",
          ellipsis: true,
        },
        {
          title: "Campaign Name",
          dataIndex: "campaign_name",
          key: "campaign_name",
          width: 220,
          ellipsis: true,
        },
      ]),
    []
  );

  const qaConsolidatedColumns: ColumnsType<QaAuditorConsolidatedRow> = useMemo(
    () =>
      [
        ...outcomeColumns<QaAuditorConsolidatedRow>([
          {
            title: "QA Auditor",
            dataIndex: "qa_name",
            key: "qa_name",
            width: 200,
            fixed: "left",
            ellipsis: true,
          },
        ]),
        {
          title: "Qualified %",
          dataIndex: "qual_pct",
          key: "qual_pct",
          width: 110,
          sorter: (a, b) => a.qual_pct - b.qual_pct,
          render: (v: number) => coloredQualPct(v),
        },
      ] as ColumnsType<QaAuditorConsolidatedRow>,
    []
  );

  const tabItems = useMemo(
    () => [
      {
        key: "agent-daily",
        label: "All Agents — Daily Performance",
        children: (
          <ReportTable<AgentDailyRow>
            rowKey={(r) => `${r.date}:${r.agent_id}`}
            columns={agentDailyColumns}
            dataSource={agentDailyData}
            scrollX={900}
            resetKey={queryUrl}
          />
        ),
      },
      {
        key: "agent-consolidated",
        label: "Agent Consolidated (Monthly)",
        children: (
          <ReportTable<AgentConsolidatedRow>
            rowKey="agent_id"
            columns={agentConsolidatedColumns}
            dataSource={agentConsolidatedData}
            scrollX={800}
            resetKey={queryUrl}
          />
        ),
      },
      {
        key: "qa-detail",
        label: "QA Auditor — Campaign Detail",
        children: (
          <ReportTable<QaAuditorDetailRow>
            rowKey={(r) => `${r.qa_id}:${r.campaign_id}`}
            columns={qaDetailColumns}
            dataSource={qaDetailData}
            scrollX={1000}
            resetKey={queryUrl}
          />
        ),
      },
      {
        key: "qa-consolidated",
        label: "QA Auditor — Consolidated",
        children: (
          <ReportTable<QaAuditorConsolidatedRow>
            rowKey="qa_id"
            columns={qaConsolidatedColumns}
            dataSource={qaConsolidatedData}
            scrollX={800}
            resetKey={queryUrl}
          />
        ),
      },
    ],
    [
      agentDailyColumns,
      agentConsolidatedColumns,
      qaDetailColumns,
      qaConsolidatedColumns,
      agentDailyData,
      agentConsolidatedData,
      qaDetailData,
      qaConsolidatedData,
      queryUrl,
    ]
  );

  const exportData = useMemo(
    () => ({
      agentDaily: agentDailyData,
      agentConsolidated: agentConsolidatedData,
      qaDetail: qaDetailData,
      qaConsolidated: qaConsolidatedData,
    }),
    [agentDailyData, agentConsolidatedData, qaDetailData, qaConsolidatedData]
  );

  const handleExport = (format: "csv" | "excel") => {
    const result = downloadOpsReportTab(
      activeTab,
      exportData,
      format,
      data?.date_range
    );
    if (!result.ok) {
      message.warning(result.message);
      return;
    }
    message.success(`Exported ${format.toUpperCase()} for the active tab`);
  };

  const exportMenuItems: MenuProps["items"] = [
    { key: "csv", label: "Export CSV", onClick: () => handleExport("csv") },
    { key: "excel", label: "Export Excel", onClick: () => handleExport("excel") },
  ];

  return (
    <Spin spinning={isLoading && !data}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          Associate-wise Ops Team Performance
        </Title>
        <Text type="secondary">
          <Tag color="blue" style={{ marginRight: 8 }}>
            QA Audit Dashboard
          </Tag>
          Agent uploads, QA outcomes, and auditor performance for the selected period.
        </Text>
      </div>

      <OpsPerformanceFilterBar
        filters={filters}
        options={filterOptions}
        optionsLoading={optionsLoading}
        onChange={setFilters}
        onClearAll={clearAllFilters}
      />

      <Card style={{ ...cardStyle, marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <Row gutter={[12, 12]} align="middle">
          <Col>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
              Refresh
            </Button>
          </Col>
          {data?.date_range && (
            <Col flex="auto">
              <Text type="secondary" style={{ fontSize: 13 }}>
                Period: {dayjs(data.date_range.start).format("DD MMM YYYY")}{" "}
                {data.date_range.start_time ?? filters.startTime.format("HH:mm")} –{" "}
                {dayjs(data.date_range.end).format("DD MMM YYYY")}{" "}
                {data.date_range.end_time ?? filters.endTime.format("HH:mm")}
              </Text>
            </Col>
          )}
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {kpiCards.map((kpi) => (
          <Col xs={12} sm={8} md={6} lg={4} xl={4} key={kpi.key}>
            <Card style={cardStyle} styles={{ body: { padding: "14px 16px" } }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${kpi.color}14`,
                    color: kpi.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {kpi.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {kpi.label}
                  </Text>
                  <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>
                    {formatKpi(kpi.key, summary, "suffix" in kpi ? kpi.suffix : undefined)}
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={8}>
          <Card
            title={
              <span>
                <AuditOutlined style={{ marginRight: 8, color: "#4f46e5" }} />
                QA Auditor Performance
              </span>
            }
            style={cardStyle}
            styles={{ body: { padding: "12px 8px 8px", height: 280 } }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.qa_auditor_performance ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <RechartsTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="qualified" stackId="a" fill="#52c41a" name="Qualified" />
                <Bar dataKey="disqualified" stackId="a" fill="#ef4444" name="Disqualified" />
                <Bar dataKey="rectified" stackId="a" fill="#722ed1" name="Rectified" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title={
              <span>
                <BarChartOutlined style={{ marginRight: 8, color: "#4f46e5" }} />
                Daily Lead Volume Trend
              </span>
            }
            style={cardStyle}
            styles={{ body: { padding: "12px 8px 8px", height: 280 } }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts?.daily_lead_volume ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => dayjs(v).format("DD MMM")}
                />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <RechartsTooltip
                  labelFormatter={(v) => dayjs(v).format("DD MMM YYYY")}
                  formatter={(value: number, name: string) => [
                    Number(value).toLocaleString("en-US"),
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Total"
                />
                <Line
                  type="monotone"
                  dataKey="qualified"
                  stroke="#52c41a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Qualified"
                />
                <Line
                  type="monotone"
                  dataKey="disqualified"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Disqualified"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title={
              <span>
                <TeamOutlined style={{ marginRight: 8, color: "#4f46e5" }} />
                Agent-wise Lead Processing
              </span>
            }
            style={cardStyle}
            styles={{ body: { padding: "12px 8px 8px", height: 280 } }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.agent_lead_processing ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" hide />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <RechartsTooltip
                  labelFormatter={(label) => String(label)}
                  formatter={(value: number, name: string) => [
                    Number(value).toLocaleString("en-US"),
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="total" fill="#4f46e5" name="Total" radius={[4, 4, 0, 0]} />
                <Bar dataKey="qualified" fill="#52c41a" name="Qualified" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Card style={cardStyle} styles={{ body: { padding: "12px 16px 16px" } }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as OpsReportTabKey)}
          tabBarExtraContent={
            <Dropdown menu={{ items: exportMenuItems }} trigger={["click"]}>
              <Button type="primary" icon={<DownloadOutlined />}>
                Export
              </Button>
            </Dropdown>
          }
          items={tabItems}
        />
      </Card>
    </Spin>
  );
}
