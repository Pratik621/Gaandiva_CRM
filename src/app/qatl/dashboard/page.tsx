"use client";

import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import DashboardGreeting from "@/components/Dashboard/DashboardGreeting";
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Tag,
  Table,
  Button,
  Tooltip,
  Input,
  Skeleton,
  message,
} from "antd";
import {
  FundProjectionScreenOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  PieChartOutlined,
  BarChartOutlined,
  DownloadOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  CloudUploadOutlined,
  ClockCircleOutlined,
  ArrowUpOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/context/AuthContext";
import { useCachedApiQuery } from "@/hooks/useCachedApiQuery";

// Code-split the two heavier chart widgets — their recharts config/render cost
// is deferred until this section actually mounts instead of bloating the
// initial dashboard bundle.
const CampaignPerformanceChart = lazy(
  () => import("@/components/QA_TL/CampaignPerformanceChart")
);
const CampaignTypeDonutChart = lazy(
  () => import("@/components/QA_TL/CampaignTypeDonutChart")
);

function ChartSkeleton() {
  return (
    <div style={{ padding: "4px 0", height: "100%" }}>
      <Skeleton active title={false} paragraph={{ rows: 6 }} />
    </div>
  );
}

const { Text, Title } = Typography;

type QatlStats = {
  totalCampaigns: number;
  totalLeadsUploaded: number;
  leadsAssignedToAgents: number;
  pendingLeads: number;
  completedLeads: number;
  qaApprovedLeads: number;
  qaRejectedLeads: number;
  callBackLeads: number;
};

type DailyUploadPoint = {
  date: string;
  count: number;
};

type CampaignPerformanceRow = {
  id: string;
  name: string;
  campaign_code: string | null;
  totalAllocation: number | null;
  totalLeads: number;
  qualifiedLeads: number;
  disqualifiedLeads: number;
  pendingAudit: number;
  delivered: number;
  rejected: number;
  pendingDelivery: number;
};

type CampaignTypeSlice = {
  type: string;
  count: number;
};

type AgentDistributionRow = {
  agent_id: string | null;
  agent_name: string;
  totalLeads: number;
  assignedLeads: number;
  pendingLeads: number;
  completedLeads: number;
  qaApprovedLeads: number;
  qaRejectedLeads: number;
  callBackLeads: number;
};

type QatlDashboardResponse = {
  stats: QatlStats;
  dailyUploads: DailyUploadPoint[];
  campaignPerformance: CampaignPerformanceRow[];
  campaignTypeDistribution: CampaignTypeSlice[];
  agentDistribution: AgentDistributionRow[];
};

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
  transition: "all 0.3s ease",
  cursor: "pointer" as const,
};

// A hard, fixed height (not "100%"/flex-stretch) so Campaign Performance,
// Campaign Type Distribution, and Daily Upload Count always render at
// exactly the same size, regardless of their content.
const CHART_CARD_HEIGHT = 420;

const statCardHover = (e: React.MouseEvent<HTMLDivElement>, enter: boolean) => {
  const el = e.currentTarget;
  el.style.boxShadow = enter ? "0 4px 16px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.04)";
  el.style.transform = enter ? "translateY(-2px)" : "translateY(0)";
};

export default function QATLDashboardPage() {
  const { hasRole, isInitialized, profile } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState("");

  // Stable boolean — avoids re-triggering fetchData when the `hasRole` function
  // reference is replaced (which happens on any roles state update, even silent ones).
  const isQatlAuthorized = isInitialized && (hasRole("qa_tl") || hasRole("admin"));

  const listEnabled =
    isQatlAuthorized &&
    !isOffline &&
    typeof navigator !== "undefined" &&
    navigator.onLine;

  const {
    data,
    isLoading,
    error: queryError,
    refetch,
  } = useCachedApiQuery<QatlDashboardResponse>(
    ["qatl", "dashboard"],
    "/api/qatl/dashboard",
    { enabled: listEnabled }
  );

  const loading = isLoading && !data;

  useEffect(() => {
    if (queryError) {
      message.error(
        queryError instanceof Error ? queryError.message : "Failed to load QA TL dashboard"
      );
    }
  }, [queryError]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      void refetch();
    };
    const handleOffline = () => setIsOffline(true);
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [refetch]);

  const statsCards = useMemo(() => {
    const s = data?.stats;
    return [
      {
        title: "Total Campaigns",
        value: (s?.totalCampaigns ?? 0).toLocaleString(),
        change: "All active & closed",
        icon: <FundProjectionScreenOutlined />,
        color: "#4f46e5",
        bgColor: "#eef2ff",
      },
      {
        title: "Total Leads Uploaded",
        value: (s?.totalLeadsUploaded ?? 0).toLocaleString(),
        change: "All time",
        icon: <DatabaseOutlined />,
        color: "#722ed1",
        bgColor: "#f9f0ff",
      },
      {
        title: "Leads Assigned to Agents",
        value: (s?.leadsAssignedToAgents ?? 0).toLocaleString(),
        change: "Currently assigned",
        icon: <TeamOutlined />,
        color: "#52c41a",
        bgColor: "#f6ffed",
      },
      {
        title: "Pending Leads",
        value: (s?.pendingLeads ?? 0).toLocaleString(),
        change: "Awaiting QA qualification",
        icon: <ClockCircleOutlined />,
        color: "#f59e0b",
        bgColor: "#fffbe6",
      },
    ];
  }, [data]);

  const secondaryCards = useMemo(() => {
    const s = data?.stats;
    return [
      {
        title: "Completed Leads",
        value: (s?.completedLeads ?? 0).toLocaleString(),
        subtitle: "Closed / completed",
        color: "#389e0d",
      },
      {
        title: "QA Approved Leads",
        value: (s?.qaApprovedLeads ?? 0).toLocaleString(),
        subtitle: "Pass / approved",
        color: "#52c41a",
      },
      {
        title: "QA Rejected Leads",
        value: (s?.qaRejectedLeads ?? 0).toLocaleString(),
        subtitle: "Failed QA",
        color: "#ef4444",
      },
      {
        title: "Call Back Leads",
        value: (s?.callBackLeads ?? 0).toLocaleString(),
        subtitle: "Marked for call back",
        color: "#13c2c2",
      },
    ];
  }, [data]);

  const campaignTypeSlices = useMemo(() => data?.campaignTypeDistribution ?? [], [data]);

  const campaignPerformanceData = useMemo(
    () => data?.campaignPerformance ?? [],
    [data]
  );

  const filteredCampaignPerformanceData = useMemo(() => {
    const term = campaignSearch.trim().toLowerCase();
    if (!term) return campaignPerformanceData;
    return campaignPerformanceData.filter((r) =>
      r.name.toLowerCase().includes(term)
    );
  }, [campaignPerformanceData, campaignSearch]);

  const dailyUploadsData = useMemo(
    () => data?.dailyUploads ?? [],
    [data]
  );

  const handleExport = async (type: string, format: "csv" | "excel") => {
    try {
      const url = `/api/qatl/export?type=${encodeURIComponent(type)}&format=${encodeURIComponent(format)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Failed to export data");
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const ext = format === "excel" ? "xlsx" : "csv";
      a.href = href;
      a.download = `qatl-${type}-${ts}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      message.success("Export started");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to export data");
    }
  };

  if (!isQatlAuthorized) {
    return null;
  }

  return (
    <div style={{ padding: "0 4px", maxWidth: 1600, margin: "0 auto" }}>
      <DashboardGreeting />

      {isOffline && (
        <div style={{ marginBottom: 24 }}>
          <Text type="danger" style={{ fontSize: 14 }}>
            You appear to be offline. Data will reload when back online, or{" "}
            <Button
              type="link"
              onClick={() => void refetch()}
              style={{ padding: 0 }}
            >
              retry now
            </Button>
            .
          </Text>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
            {statsCards.map((stat, index) => (
              <Col xs={24} sm={12} xl={6} key={index}>
                <Card
                  bordered={false}
                  style={{ ...cardStyle, height: "100%" }}
                  styles={{ body: { padding: "24px" } }}
                  onMouseEnter={(e) => statCardHover(e, true)}
                  onMouseLeave={(e) => statCardHover(e, false)}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <Text
                        type="secondary"
                        style={{
                          fontSize: 13,
                          display: "block",
                          marginBottom: 8,
                        }}
                      >
                        {stat.title}
                      </Text>
                      <div
                        style={{
                          fontSize: 32,
                          fontWeight: 700,
                          color: "#1f1f1f",
                          lineHeight: 1,
                          marginBottom: 12,
                        }}
                      >
                        {stat.value}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <ArrowUpOutlined
                          style={{ color: "#52c41a", fontSize: 12 }}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#6b7280",
                            fontWeight: 500,
                          }}
                        >
                          {stat.change}
                        </Text>
                      </div>
                    </div>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        backgroundColor: stat.bgColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 22,
                        color: stat.color,
                      }}
                    >
                      {stat.icon}
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
            {secondaryCards.map((card, index) => (
              <Col xs={24} sm={12} xl={6} key={index}>
                <Card
                  bordered={false}
                  style={{ ...cardStyle, height: "100%" }}
                  styles={{ body: { padding: "20px 22px" } }}
                >
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 13,
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    {card.title}
                  </Text>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      color: "#1f1f1f",
                      lineHeight: 1,
                      marginBottom: 6,
                    }}
                  >
                    {card.value}
                  </div>
                  <Text style={{ fontSize: 12, color: card.color }}>
                    {card.subtitle}
                  </Text>
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
            <Col xs={24} xl={8}>
              <Card
                title={
                  <Text strong style={{ fontSize: 16 }}>
                    Campaign Performance
                  </Text>
                }
                bordered={false}
                style={{
                  ...cardStyle,
                  height: CHART_CARD_HEIGHT,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
                styles={{
                  body: {
                    padding: "24px 24px 20px",
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  },
                }}
              >
                <Suspense fallback={<ChartSkeleton />}>
                  <CampaignPerformanceChart data={campaignPerformanceData} />
                </Suspense>
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card
                title={
                  <Text strong style={{ fontSize: 16 }}>
                    Campaign Type Distribution
                  </Text>
                }
                bordered={false}
                style={{
                  ...cardStyle,
                  height: CHART_CARD_HEIGHT,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
                styles={{
                  body: {
                    padding: "24px 24px 20px",
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  },
                }}
              >
                <Suspense fallback={<ChartSkeleton />}>
                  <CampaignTypeDonutChart slices={campaignTypeSlices} />
                </Suspense>
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card
                title={
                  <Text strong style={{ fontSize: 16 }}>
                    Daily Upload Count
                  </Text>
                }
                bordered={false}
                style={{
                  ...cardStyle,
                  height: CHART_CARD_HEIGHT,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
                styles={{
                  body: {
                    padding: "24px 24px 20px",
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  },
                }}
              >
                {/* Chart area fills the fixed CHART_CARD_HEIGHT budget via flex:1 — the
                    chart itself, data, and behavior are unchanged. */}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={
                        dailyUploadsData.length
                          ? dailyUploadsData
                          : [{ date: "—", count: 0 }]
                      }
                      margin={{ top: 5, right: 5, left: -15, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" stroke="#6b7280" fontSize={11} />
                      <YAxis stroke="#6b7280" fontSize={11} />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #f0f0f0",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorUploads)"
                        name="Leads Uploaded"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
            <Col xs={24}>
              <Card
                title={
                  <Text strong style={{ fontSize: 16 }}>
                    Campaigns with Leads
                  </Text>
                }
                extra={
                  <Input
                    allowClear
                    placeholder="Search campaign name"
                    prefix={<SearchOutlined style={{ color: "#9ca3af" }} />}
                    value={campaignSearch}
                    onChange={(e) => setCampaignSearch(e.target.value)}
                    style={{ width: 260 }}
                  />
                }
                bordered={false}
                style={cardStyle}
              >
                <Table
                  dataSource={filteredCampaignPerformanceData}
                  rowKey={(r) => r.id}
                  size="middle"
                  scroll={{ x: 1220 }}
                  pagination={{
                    defaultPageSize: 10,
                    showSizeChanger: true,
                    showTotal: (t) => `Total ${t} campaigns`,
                  }}
                  columns={[
                    {
                      title: "Campaign Code",
                      dataIndex: "campaign_code",
                      key: "campaign_code",
                      width: 110,
                      render: (val: string | null) => (
                        <Tag color="blue" style={{ fontFamily: "monospace", fontSize: 12 }}>
                          {val || "—"}
                        </Tag>
                      ),
                    },
                    {
                      title: "Campaign",
                      dataIndex: "name",
                      key: "name",
                      width: 140,
                      ellipsis: { showTitle: false },
                      render: (val: string) => (
                        <Tooltip title={val} placement="topLeft">
                          <span style={{ fontWeight: 500 }}>{val}</span>
                        </Tooltip>
                      ),
                    },
                    {
  title: "Total Allocation",
  dataIndex: "totalAllocation",
  key: "totalAllocation",
  width: 120,
  render: (v: number | null) => (
    <Tag color="geekblue">{v ?? "—"}</Tag>
  ),
},
{
  title: "Total Leads",
  dataIndex: "totalLeads",
  key: "totalLeads",
  width: 100,
  render: (v: number) => (
    <Tag color="cyan">{v}</Tag>
  ),
},
                    {
                      title: "Qualified",
                      dataIndex: "qualifiedLeads",
                      key: "qualifiedLeads",
                      width: 100,
                      render: (v: number) => <Tag color="green">{v}</Tag>,
                    },
                    {
                      title: "Disqualified",
                      dataIndex: "disqualifiedLeads",
                      key: "disqualifiedLeads",
                      width: 110,
                      render: (v: number) => <Tag color="volcano">{v}</Tag>,
                    },
                    {
                      title: "Pending Audit",
                      dataIndex: "pendingAudit",
                      key: "pendingAudit",
                      width: 120,
                      sorter: {
                        compare: (a: CampaignPerformanceRow, b: CampaignPerformanceRow) =>
                          a.pendingAudit - b.pendingAudit,
                        multiple: 2,
                      },
                      defaultSortOrder: "descend" as const,
                      sortDirections: ["descend", "ascend"] as const,
                      render: (v: number) => <Tag color="gold">{v}</Tag>,
                    },
                    {
                      title: "Delivered",
                      dataIndex: "delivered",
                      key: "delivered",
                      width: 100,
                      render: (v: number) => <Tag color="blue">{v}</Tag>,
                    },
                    {
                      title: "Rejected",
                      dataIndex: "rejected",
                      key: "rejected",
                      width: 100,
                      render: (v: number) => <Tag>{v}</Tag>,
                    },
                    {
                      title: "Pending Delivery",
                      dataIndex: "pendingDelivery",
                      key: "pendingDelivery",
                      width: 130,
                      sorter: {
                        compare: (a: CampaignPerformanceRow, b: CampaignPerformanceRow) =>
                          a.pendingDelivery - b.pendingDelivery,
                        multiple: 1,
                      },
                      defaultSortOrder: "descend" as const,
                      sortDirections: ["descend", "ascend"] as const,
                      render: (v: number) => <Tag color="purple">{v}</Tag>,
                    },
                  ]}
                  locale={{
                    emptyText: campaignSearch.trim()
                      ? "No campaigns match your search."
                      : "No campaigns with leads yet.",
                  }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

