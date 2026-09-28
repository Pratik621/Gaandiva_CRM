"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import DashboardGreeting from "@/components/Dashboard/DashboardGreeting";
import {
  Card,
  Row,
  Col,
  Typography,
  Tag,
  Table,
  Button,
  Input,
  Select,
  Skeleton,
} from "antd";
import {
  FundProjectionScreenOutlined,
  RiseOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  DollarCircleOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { useAgentDashboard, type AgentDashboardCampaignRow } from "@/hooks/useAgentDashboard";
import {
  StatCardsRowSkeleton,
  TableSkeleton,
} from "@/components/Dashboard/DashboardSkeletons";
import {
  AgentLeadTrendChart,
  AgentCampaignLeadsChart,
  AgentCompletionPredictions,
} from "@/components/Dashboard/AgentDashboardCharts";
import { tableEllipsisCell } from "@/lib/table-ellipsis-cell";

const { Text } = Typography;

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
  transition: "all 0.3s ease",
};

const statCardHover = (e: React.MouseEvent<HTMLDivElement>, enter: boolean) => {
  const el = e.currentTarget;
  el.style.boxShadow = enter ? "0 4px 16px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.04)";
  el.style.transform = enter ? "translateY(-2px)" : "translateY(0)";
};

const statusColors: Record<string, string> = {
  draft: "default",
  active: "green",
  paused: "orange",
  completed: "success",
};

function ChartsRowSkeleton() {
  return (
    <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
      {[0, 1].map((i) => (
        <Col xs={24} lg={12} key={i}>
          <Card bordered={false} style={cardStyle}>
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

export default function AgentDashboardPage() {
  const { hasRole, isInitialized } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const enabled = Boolean(isInitialized && hasRole("agent"));
  const { dashboard, campaigns, refetch } = useAgentDashboard(enabled);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      setIsOffline(false);
      refetch();
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refetch]);

  const summary = dashboard.data?.summary;
  const leadTrend = dashboard.data?.leadTrend ?? [];
  const campaignLeads = dashboard.data?.campaignLeads ?? [];
  const completionPredictions = dashboard.data?.completionPredictions ?? [];

  const statsCards = useMemo(() => {
    const s = summary ?? {
      totalCampaigns: 0,
      activeCampaigns: 0,
      totalLeads: 0,
      pendingLeads: 0,
      qualifiedLeads: 0,
      disqualifiedLeads: 0,
      qualifiedRatePct: 0,
      billableLeads: 0,
    };
    return [
      {
        title: "Assigned Campaigns",
        value: s.totalCampaigns.toLocaleString(),
        change: `${s.activeCampaigns} active`,
        icon: <FundProjectionScreenOutlined />,
        color: "#4f46e5",
        bgColor: "#eef2ff",
      },
      {
        title: "My Leads",
        value: s.totalLeads.toLocaleString(),
        change: `${s.pendingLeads.toLocaleString()} pending QA`,
        icon: <TeamOutlined />,
        color: "#722ed1",
        bgColor: "#f9f0ff",
      },
      {
        title: "Qualified",
        value: s.qualifiedLeads.toLocaleString(),
        change: `${s.qualifiedRatePct}% of your leads`,
        icon: <CheckCircleOutlined />,
        color: "#52c41a",
        bgColor: "#f6ffed",
      },
      {
        title: "Disqualified",
        value: s.disqualifiedLeads.toLocaleString(),
        change: "Audited, not qualified",
        icon: <RiseOutlined />,
        color: "#ef4444",
        bgColor: "#fff1f0",
      },
      {
        title: "Billable Leads",
        value: s.billableLeads.toLocaleString(),
        change:
          s.billableLeads > 0
            ? "Attended-Billable leads"
            : "No billable leads yet",
        icon: <DollarCircleOutlined />,
        color: "#08979c",
        bgColor: "#e6fffb",
      },
    ];
  }, [summary]);

  const campaignList = useMemo(
    () => campaigns.data?.campaigns ?? [],
    [campaigns.data?.campaigns]
  );

  const filteredCampaigns = useMemo(() => {
    let result = campaignList;
    const q = searchText.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(q) ||
          (c.campaign_code ?? "").toLowerCase().includes(q) ||
          (c.industry ?? "").toLowerCase().includes(q) ||
          (c.geography ?? "").toLowerCase().includes(q) ||
          (c.lead_type ?? "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter((c) => c.status === statusFilter);
    return result;
  }, [campaignList, searchText, statusFilter]);

  if (!isInitialized || !hasRole("agent")) {
    return null;
  }

  const dashboardReady = dashboard.isSuccess;
  const campaignsReady = campaigns.isSuccess;

  return (
    <div style={{ padding: "0 4px", maxWidth: 1600, margin: "0 auto" }}>
      <DashboardGreeting />

      {isOffline && (
        <div style={{ marginBottom: 24 }}>
          <Text type="danger" style={{ fontSize: 14 }}>
            You appear to be offline. Data will reload when back online, or{" "}
            <Button type="link" onClick={() => refetch()} style={{ padding: 0 }}>
              retry now
            </Button>
            .
          </Text>
        </div>
      )}

      {dashboard.error && (
        <div style={{ marginBottom: 24 }}>
          <Text type="danger">
            {dashboard.error instanceof Error ? dashboard.error.message : "Failed to load dashboard"}
          </Text>
          <Button type="link" onClick={() => refetch()} style={{ marginLeft: 8 }}>
            Retry
          </Button>
        </div>
      )}

      {!dashboardReady ? (
        <StatCardsRowSkeleton count={5} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
            marginBottom: 24,
          }}
        >
          {statsCards.map((stat, index) => (
            <div key={index}>
              <Card
                bordered={false}
                style={{ ...cardStyle, height: "100%" }}
                styles={{ body: { padding: "24px" } }}
                onMouseEnter={(e) => statCardHover(e, true)}
                onMouseLeave={(e) => statCardHover(e, false)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
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
                    <Text style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{stat.change}</Text>
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
            </div>
          ))}
        </div>
      )}

      {!dashboardReady ? (
        <ChartsRowSkeleton />
      ) : (
        <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
          <Col xs={24} lg={12}>
            <AgentLeadTrendChart data={leadTrend} />
          </Col>
          <Col xs={24} lg={12}>
            <AgentCampaignLeadsChart data={campaignLeads} />
          </Col>
        </Row>
      )}

      {!dashboardReady ? (
        <Card bordered={false} style={{ ...cardStyle, marginBottom: 24 }}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      ) : (
        <div style={{ marginBottom: 24 }}>
          <AgentCompletionPredictions predictions={completionPredictions} />
        </div>
      )}

      {!campaignsReady ? (
        <TableSkeleton rows={5} />
      ) : (
        <Row gutter={[20, 20]}>
          <Col xs={24}>
            <Card
              title={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ClockCircleOutlined style={{ color: "#4f46e5" }} />
                  <Text strong style={{ fontSize: 16 }}>
                    My Assigned Campaigns
                  </Text>
                </div>
              }
              bordered={false}
              style={cardStyle}
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
                    options={[
                      { value: "draft", label: "Draft" },
                      { value: "active", label: "Active" },
                      { value: "paused", label: "Paused" },
                      { value: "completed", label: "Completed" },
                    ]}
                    style={{ width: 160 }}
                  />
                </div>
              }
            >
              <Table
                className="table-single-line"
                dataSource={filteredCampaigns}
                rowKey="id"
                pagination={{
                  defaultPageSize: 10,
                  showSizeChanger: true,
                  showTotal: (t) => `Total ${t} campaigns`,
                }}
                size="middle"
                scroll={{ x: 1150 }}
                locale={{
                  emptyText:
                    "No campaigns assigned yet. Your Team Leader can assign you to campaigns.",
                }}
                columns={[
                  {
                    title: "#",
                    key: "index",
                    width: 56,
                    align: "center" as const,
                    render: (_: unknown, __: unknown, i: number) => i + 1,
                  },
                  {
                    title: "Campaign Code",
                    dataIndex: "campaign_code",
                    key: "campaign_code",
                    width: 130,
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
                    ellipsis: true,
                    render: (val: string, r: AgentDashboardCampaignRow) => (
                      <Link href={`/agent/campaigns/${r.id}`} style={{ fontWeight: 600, fontSize: 14 }}>
                        {val}
                      </Link>
                    ),
                  },
                  {
                    title: "Lead Type",
                    dataIndex: "lead_type",
                    key: "lead_type",
                    width: 120,
                    ellipsis: true,
                    render: (v: string | null) => tableEllipsisCell(v),
                  },
                  {
                    title: "Status",
                    dataIndex: "status",
                    key: "status",
                    width: 100,
                    render: (v: string) => (
                      <Tag color={statusColors[v] ?? "default"}>
                        {v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v}
                      </Tag>
                    ),
                  },
                  {
                    title: "Start Date",
                    dataIndex: "start_date",
                    key: "start_date",
                    width: 110,
                    render: (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—"),
                  },
                  {
                    title: "End Date",
                    dataIndex: "end_date",
                    key: "end_date",
                    width: 110,
                    render: (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—"),
                  },
                  { title: "My Leads", dataIndex: "total_leads", key: "total_leads", width: 100 },
                  {
                    title: "Qualified",
                    dataIndex: "qualified_leads",
                    key: "qualified_leads",
                    width: 96,
                    align: "center" as const,
                    render: (v: number) => (
                      <Text style={{ fontSize: 13, fontWeight: 600, color: "#52c41a" }}>
                        {v ?? 0}
                      </Text>
                    ),
                  },
                  {
                    title: "",
                    key: "action",
                    width: 100,
                    render: (_: unknown, r: AgentDashboardCampaignRow) => (
                      <Link href={`/agent/campaigns/${r.id}`}>
                        <Button type="primary" size="small" icon={<EyeOutlined />}>
                          View
                        </Button>
                      </Link>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
