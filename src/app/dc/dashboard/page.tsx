"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  Col,
  Row,
  Typography,
  Tag,
  Button,
  Table,
  Skeleton,
  Dropdown,
  MenuProps,
} from "antd";
import {
  FundProjectionScreenOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

const { Title, Text } = Typography;

interface TrendPoint {
  date: string;
  value: number;
}

interface CampaignStatusCounts {
  active: number;
  completed: number;
  paused: number;
}

interface RecentCampaign {
  id: string;
  name: string;
  status: string;
  total_leads: number;
  qualified_leads: number;
  created_at: string;
}

interface DashboardStats {
  totalCampaigns: number;
  totalLeads: number;
  qualifiedLeads: number;
  campaignStatus: CampaignStatusCounts;
  trends: {
    campaigns: { change: string; series: TrendPoint[] };
    leads: { change: string; series: TrendPoint[] };
    qualifiedLeads: { change: string; series: TrendPoint[] };
  };
  recentCampaigns: RecentCampaign[];
}

const pageStyle = {
  minHeight: "100%",
  backgroundColor: "#f5f6f8",
  padding: 24,
};

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  border: "1px solid #f0f0f0",
};

const statusColors: Record<string, string> = {
  active: "green",
  completed: "success",
  paused: "orange",
};

const statCardItems = [
  {
    key: "totalCampaigns",
    title: "Total Campaigns",
    icon: <FundProjectionScreenOutlined />,
    color: "#4f46e5",
    bg: "#eef2ff",
    trendKey: "campaigns",
  },
  {
    key: "totalLeads",
    title: "Total Leads",
    icon: <TeamOutlined />,
    color: "#722ed1",
    bg: "#f9f0ff",
    trendKey: "leads",
  },
  {
    key: "qualifiedLeads",
    title: "Qualified Leads",
    icon: <CheckCircleOutlined />,
    color: "#52c41a",
    bg: "#f6ffed",
    trendKey: "qualifiedLeads",
  },
];

const sparklineColors: Record<string, string> = {
  campaigns: "#4f46e5",
  leads: "#722ed1",
  qualifiedLeads: "#52c41a",
};

function renderSparkline(series: TrendPoint[], stroke: string, id: string) {
  const chartData = series.length > 0 ? series : Array.from({ length: 7 }, (_, index) => ({ date: `Day ${index + 1}`, value: 0 }));
  return (
    <div style={{ width: "100%", height: 48, marginTop: 10 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fillOpacity={1} fill={`url(#spark-${id})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export default function DCDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = () => {
    setLoading(true);
    fetch("/api/dc/campaigns/dashboard")
      .then((response) => response.json())
      .then((data: DashboardStats & { error?: string }) => {
        if (data?.error) {
          console.error(data.error);
          setStats(null);
          return;
        }
        setStats({
          totalCampaigns: data.totalCampaigns ?? 0,
          totalLeads: data.totalLeads ?? 0,
          qualifiedLeads: data.qualifiedLeads ?? 0,
          campaignStatus: data.campaignStatus ?? { active: 0, completed: 0, paused: 0 },
          trends: data.trends ?? {
            campaigns: { change: "0% from last 7 days", series: [] },
            leads: { change: "0% from last 7 days", series: [] },
            qualifiedLeads: { change: "0% from last 7 days", series: [] },
          },
          recentCampaigns: data.recentCampaigns ?? [],
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const exportReport = () => {
    if (!stats) return;
    const headers = ["Metric", "Value"];
    const rows = [
      ["Total Campaigns", String(stats.totalCampaigns)],
      ["Total Leads", String(stats.totalLeads)],
      ["Qualified Leads", String(stats.qualifiedLeads)],
      ["Active Campaigns", String(stats.campaignStatus.active)],
      ["Completed Campaigns", String(stats.campaignStatus.completed)],
      ["Paused Campaigns", String(stats.campaignStatus.paused)],
      [],
      ["Campaign Name", "Status", "Total Leads", "Qualified Leads", "Created On"],
      ...stats.recentCampaigns.map((campaign) => [
        campaign.name,
        campaign.status,
        String(campaign.total_leads),
        String(campaign.qualified_leads),
        formatDate(campaign.created_at),
      ]),
    ];
    const csvContent = [headers.join(","), ...rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "dc-dashboard-report.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const campaignStatus = stats?.campaignStatus ?? { active: 0, completed: 0, paused: 0 };

  const statusData = stats
    ? [
      { name: "Active", value: campaignStatus.active, color: "#52c41a" },
      { name: "Completed", value: campaignStatus.completed, color: "#4f46e5" },
      { name: "Paused", value: campaignStatus.paused, color: "#f59e0b" },
    ].filter((item) => item.value > 0)
    : [];

  const statusTotal = campaignStatus.active + campaignStatus.completed + campaignStatus.paused;

  const columns = [
    {
      title: "Campaign Name",
      dataIndex: "name",
      key: "name",
      render: (value: string, record: RecentCampaign) => (
        <Link href={`/dc/campaigns/${record.id}`} style={{ fontWeight: 600 }}>
          {value}
        </Link>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag color={statusColors[status.toLowerCase()] ?? "default"}>{status}</Tag>
      ),
    },
    {
      title: "Total Leads",
      dataIndex: "total_leads",
      key: "total_leads",
      width: 120,
    },
    {
      title: "Qualified Leads",
      dataIndex: "qualified_leads",
      key: "qualified_leads",
      width: 140,
    },
    {
      title: "Created On",
      dataIndex: "created_at",
      key: "created_at",
      width: 140,
      render: (value: string) => formatDate(value),
    },
    {
      title: "Actions",
      key: "actions",
      width: 80,
      render: (_: unknown, record: RecentCampaign) => {
        const items: MenuProps["items"] = [
          {
            key: "view",
            label: "View Details",
          },
        ];

        const onMenuClick: MenuProps["onClick"] = ({ key }) => {
          if (key === "view") {
            router.push(`/dc/campaigns/${record.id}`);
          }
        };

        return (
          <Dropdown menu={{ items, onClick: onMenuClick }} trigger={["click"]}>
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
    },
  ];

  return (
    <div style={pageStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 280 }}>
          <Text type="secondary" style={{ fontSize: 28, lineHeight: 1.6, fontWeight: 700, color: "#1f1f1f" }}>
            Welcome DC!
          </Text>
        </div>
      </div>

      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        {statCardItems.map((item) => {
          const value = stats
            ? item.key === "totalCampaigns"
              ? stats.totalCampaigns
              : item.key === "totalLeads"
                ? stats.totalLeads
                : stats.qualifiedLeads
            : 0;
          const trend = stats
            ? stats.trends[item.trendKey as keyof DashboardStats["trends"]]
            : { change: "0% from last 7 days", series: [] };
          return (
            <Col xs={24} sm={8} key={item.key}>
              <Card bordered={false} style={cardStyle} bodyStyle={{ padding: 24 }}>
                {loading ? (
                  <Skeleton active title={{ width: "50%" }} paragraph={{ rows: 2 }} />
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                          {item.title}
                        </Text>
                        <div style={{ marginTop: 10, fontSize: 32, fontWeight: 700, color: "#1f1f1f" }}>
                          {value}
                        </div>
                      </div>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 14,
                          backgroundColor: item.bg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 22,
                          color: item.color,
                        }}
                      >
                        {item.icon}
                      </div>
                    </div>

                  </>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      <Row gutter={[20, 20]} style={{ marginBottom: 24, alignItems: "stretch" }}>
        <Col xs={24} lg={12} xl={8}>
          <Card
            bordered={false}
            style={{ ...cardStyle, height: "100%", display: "flex", flexDirection: "column" }}
            bodyStyle={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, minHeight: 44 }}>
              <Text strong style={{ fontSize: 16 }}>
                Campaign Performance
              </Text>
            </div>
            <div style={{ position: "relative", minHeight: 260, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusData.length > 0 ? statusData : [{ name: "No Campaigns", value: 1, color: "#d1d5db" }]}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    cornerRadius={2}
                  >
                    {(statusData.length > 0 ? statusData : [{ name: "No Campaigns", value: 1, color: "#d1d5db" }]).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center",
                }}
              >
                <Text strong style={{ fontSize: 28 }}>
                  {stats ? stats.totalCampaigns : "0"}
                </Text>
                <div style={{ color: "#000000", fontSize: 13, marginTop: 4 }}>Total Campaigns</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "space-between", marginTop: 20, alignItems: "stretch" }}>
              {[
                { label: "Active", count: campaignStatus.active, color: "#52c41a" },
                { label: "Completed", count: campaignStatus.completed, color: "#4f46e5" },
                { label: "Paused", count: campaignStatus.paused, color: "#f59e0b" },
              ].map((item) => {
                const percent = statusTotal > 0 ? Math.round((item.count / statusTotal) * 100) : 0;
                return (
                  <div
                    key={item.label}
                    style={{
                      flex: 1,
                      padding: 14,
                      background: "#fafafa",
                      borderRadius: 14,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      minHeight: 110,
                    }}
                  >
                    <Text strong style={{ fontSize: 13, color: item.color }}>{item.label}</Text>
                    <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{item.count}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {percent}%
                    </Text>
                  </div>
                );
              })}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12} xl={16}>
          <Card
            title={<Text strong style={{ fontSize: 16 }}>Recent Campaigns</Text>}
            bordered={false}
            style={{ ...cardStyle, height: "100%", display: "flex", flexDirection: "column" }}
            bodyStyle={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}
          >
            {loading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <Table
                  dataSource={stats?.recentCampaigns ?? []}
                  columns={columns}
                  rowKey="id"
                  pagination={false}
                  size="middle"
                  sticky
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}