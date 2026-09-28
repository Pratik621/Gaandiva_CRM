"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  Row,
  Col,
  Typography,
  Table,
  Tag,
  Avatar,
  Badge,
  Empty,
  Alert,
} from "antd";
import DashboardGreeting from "@/components/Dashboard/DashboardGreeting";
import {
  StatCardsRowSkeleton,
  ChartsRowSkeleton,
  TasksAndActivitySkeleton,
  TableSkeleton,
} from "@/components/Dashboard/DashboardSkeletons";
import {
  UserOutlined,
  FundProjectionScreenOutlined,
  TeamOutlined,
  RiseOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  FileTextOutlined,
  AuditOutlined,
  RightOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";

const { Text } = Typography;

type Trend = "up" | "down" | "neutral";

type StatCard = {
  value: string;
  change: string;
  trend: Trend;
  sub?: string;
};

type AdminDashboardData = {
  stats: {
    totalUsers: StatCard;
    campaigns: StatCard;
    clients: StatCard;
    salesLeads: StatCard;
    opsLeads: StatCard;
    roles: StatCard;
    pendingTasks: StatCard;
    qaPending: StatCard;
  };
  userGrowthData: { month: string; users: number; logins: number }[];
  roleDistribution: { name: string; value: number; color: string }[];
  leadStatusData: { status: string; count: number }[];
  dailyUploads: { date: string; count: number }[];
  salesPipeline: { stage: string; count: number }[];
  campaignPerformance: {
    id: string;
    name: string;
    code: string | null;
    status: string;
    totalLeads: number;
    qualifiedLeads: number;
    qualRate: number;
  }[];
  recentUsers: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    time: string;
  }[];
  recentSalesLeads: {
    id: string;
    name: string;
    company: string;
    source: string;
    status: string;
    time: string;
  }[];
  activityFeed: {
    id: string;
    user: string;
    action: string;
    target: string;
    time: string;
    type: string;
  }[];
  pendingTasks: {
    id: string;
    task: string;
    dueDate: string;
    priority: string;
  }[];
};

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

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #f0f0f0",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

const STATUS_COLORS: Record<string, string> = {
  Active: "green",
  New: "blue",
  Open: "cyan",
  "In progress": "green",
  "Open deal": "purple",
  Connected: "success",
};

const QUICK_LINKS = [
  { href: "/admin/users", label: "Manage Users", icon: <UserOutlined /> },
  { href: "/admin/roles", label: "Roles", icon: <SafetyCertificateOutlined /> },
  { href: "/admin/sales", label: "Sales CRM", icon: <RiseOutlined /> },
  { href: "/admin/team-performance", label: "Performance", icon: <BarChartOutlined /> },
  { href: "/admin/revenue-report", label: "Revenue", icon: <DollarOutlined /> },
  { href: "/admin/campaigns", label: "Campaigns", icon: <FundProjectionScreenOutlined /> },
];

function StatCardView({
  title,
  stat,
  icon,
  color,
  bgColor,
  href,
}: {
  title: string;
  stat: StatCard;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  href?: string;
}) {
  const inner = (
    <Card
      bordered={false}
      style={{ ...cardStyle, height: "100%", cursor: href ? "pointer" : "default" }}
      styles={{ body: { padding: "20px 22px" } }}
      onMouseEnter={(e) => statCardHover(e, true)}
      onMouseLeave={(e) => statCardHover(e, false)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
            {title}
          </Text>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#111827", lineHeight: 1.1, marginBottom: 8 }}>
            {stat.value}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {stat.trend === "up" && <ArrowUpOutlined style={{ color: "#52c41a", fontSize: 11 }} />}
            {stat.trend === "down" && <ArrowDownOutlined style={{ color: "#ef4444", fontSize: 11 }} />}
            <Text style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{stat.change}</Text>
          </div>
          {stat.sub && (
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 6 }}>
              {stat.sub}
            </Text>
          )}
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: bgColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            color,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", display: "block", height: "100%" }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

function SectionHeader({ title, extra }: { title: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <Text strong style={{ fontSize: 16, color: "#111827" }}>
        {title}
      </Text>
      {extra}
    </div>
  );
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminDashboardData | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/dashboard", { credentials: "include" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Failed to load dashboard");
        setData(j);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "0 4px" }}>
        <DashboardGreeting />
        <StatCardsRowSkeleton count={4} />
        <StatCardsRowSkeleton count={4} />
        <ChartsRowSkeleton count={3} />
        <TasksAndActivitySkeleton />
        <TableSkeleton rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "0 4px" }}>
        <DashboardGreeting />
        <Alert type="error" message="Could not load dashboard" description={error} showIcon />
      </div>
    );
  }

  const stats = data?.stats;
  const primaryStats = [
    {
      title: "Total Users",
      stat: stats?.totalUsers ?? { value: "0", change: "—", trend: "neutral" as Trend },
      icon: <UserOutlined />,
      color: "#4f46e5",
      bgColor: "#eef2ff",
      href: "/admin/users",
    },
    {
      title: "Campaigns",
      stat: stats?.campaigns ?? { value: "0", change: "—", trend: "neutral" as Trend },
      icon: <FundProjectionScreenOutlined />,
      color: "#722ed1",
      bgColor: "#f9f0ff",
      href: "/admin/campaigns",
    },
    {
      title: "Clients",
      stat: stats?.clients ?? { value: "0", change: "—", trend: "neutral" as Trend },
      icon: <TeamOutlined />,
      color: "#52c41a",
      bgColor: "#f6ffed",
    },
    {
      title: "Sales Leads",
      stat: stats?.salesLeads ?? { value: "0", change: "—", trend: "neutral" as Trend },
      icon: <RiseOutlined />,
      color: "#f59e0b",
      bgColor: "#fffbe6",
      href: "/admin/sales",
    },
  ];

  const secondaryStats = [
    {
      title: "Campaign Leads",
      stat: stats?.opsLeads ?? { value: "0", change: "—", trend: "neutral" as Trend },
      icon: <DatabaseOutlined />,
      color: "#4f46e5",
      bgColor: "#eef2ff",
      href: "/admin/leads",
    },
    {
      title: "Roles",
      stat: stats?.roles ?? { value: "0", change: "—", trend: "neutral" as Trend },
      icon: <SafetyCertificateOutlined />,
      color: "#13c2c2",
      bgColor: "#e6fffb",
      href: "/admin/roles",
    },
    {
      title: "Pending Tasks",
      stat: stats?.pendingTasks ?? { value: "0", change: "—", trend: "neutral" as Trend },
      icon: <ClockCircleOutlined />,
      color: "#fa8c16",
      bgColor: "#fff7e6",
    },
    {
      title: "QA Pending",
      stat: stats?.qaPending ?? { value: "0", change: "—", trend: "neutral" as Trend },
      icon: <AuditOutlined />,
      color: "#eb2f96",
      bgColor: "#fff0f6",
      href: "/admin/leads?qa_status=pending",
    },
  ];

  const userGrowthData = data?.userGrowthData ?? [];
  const roleDistribution = data?.roleDistribution ?? [];
  const dailyUploads = data?.dailyUploads ?? [];
  const leadStatusData = data?.leadStatusData ?? [];
  const salesPipeline = data?.salesPipeline ?? [];
  const campaignPerformance = data?.campaignPerformance ?? [];
  const recentUsers = data?.recentUsers ?? [];
  const recentSalesLeads = data?.recentSalesLeads ?? [];
  const activityFeed = data?.activityFeed ?? [];
  const pendingTasks = data?.pendingTasks ?? [];

  const campaignColumns = [
    {
      title: "Campaign",
      key: "name",
      render: (r: (typeof campaignPerformance)[0]) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
          {r.code && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {r.code}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      responsive: ["md"] as ("md")[],
      render: (s: string) => <Tag style={{ fontSize: 11 }}>{s}</Tag>,
    },
    {
      title: "Leads",
      dataIndex: "totalLeads",
      key: "totalLeads",
      align: "center" as const,
      render: (n: number) => <Text strong>{n}</Text>,
    },
    {
      title: "Qualified",
      dataIndex: "qualifiedLeads",
      key: "qualifiedLeads",
      align: "center" as const,
      responsive: ["sm"] as ("sm")[],
    },
    {
      title: "Rate",
      dataIndex: "qualRate",
      key: "qualRate",
      align: "right" as const,
      render: (n: number) => (
        <Tag color={n >= 50 ? "green" : n >= 25 ? "gold" : "default"} style={{ fontSize: 11 }}>
          {n}%
        </Tag>
      ),
    },
  ];

  const userColumns = [
    {
      title: "User",
      key: "user",
      render: (r: (typeof recentUsers)[0]) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar size={36} style={{ backgroundColor: "#4f46e5", flexShrink: 0 }}>
            {r.name[0]?.toUpperCase()}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {r.email}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      responsive: ["md"] as ("md")[],
      render: (role: string) => <Tag color="blue" style={{ fontSize: 11 }}>{role}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: string) => <Tag color={STATUS_COLORS[s] ?? "default"} style={{ fontSize: 11 }}>{s}</Tag>,
    },
    {
      title: "Joined",
      dataIndex: "time",
      key: "time",
      align: "right" as const,
      render: (t: string) => <Text type="secondary" style={{ fontSize: 11 }}>{t}</Text>,
    },
  ];

  const salesLeadColumns = [
    {
      title: "Lead",
      key: "lead",
      render: (r: (typeof recentSalesLeads)[0]) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar size={36} style={{ backgroundColor: "#f59e0b", flexShrink: 0 }}>
            {r.name[0]?.toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.company}</Text>
          </div>
        </div>
      ),
    },
    {
      title: "Source",
      dataIndex: "source",
      key: "source",
      responsive: ["md"] as ("md")[],
      render: (s: string) => <Text style={{ fontSize: 12 }}>{s}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: string) => <Tag color={STATUS_COLORS[s] ?? "default"} style={{ fontSize: 11 }}>{s}</Tag>,
    },
    {
      title: "Time",
      dataIndex: "time",
      key: "time",
      align: "right" as const,
      render: (t: string) => <Text type="secondary" style={{ fontSize: 11 }}>{t}</Text>,
    },
  ];

  return (
    <div style={{ padding: "0 4px" }}>
      <DashboardGreeting />

      {/* Quick links */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {QUICK_LINKS.map((link) => (
          <Col xs={12} sm={8} md={6} lg={4} key={link.href}>
            <Link href={link.href} style={{ textDecoration: "none" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  background: "#fff",
                  borderRadius: 12,
                  border: "1px solid #f0f0f0",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#4f46e5";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(79,70,229,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#f0f0f0";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <span style={{ color: "#4f46e5", fontSize: 16 }}>{link.icon}</span>
                <Text style={{ fontSize: 13, fontWeight: 500, color: "#374151", flex: 1 }}>{link.label}</Text>
                <RightOutlined style={{ fontSize: 10, color: "#9ca3af" }} />
              </div>
            </Link>
          </Col>
        ))}
      </Row>

      {/* Primary KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {primaryStats.map((s) => (
          <Col xs={24} sm={12} xl={6} key={s.title}>
            <StatCardView {...s} />
          </Col>
        ))}
      </Row>

      {/* Secondary KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {secondaryStats.map((s) => (
          <Col xs={24} sm={12} xl={6} key={s.title}>
            <StatCardView {...s} />
          </Col>
        ))}
      </Row>

      {/* Charts row 1 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12} xl={8}>
          <Card bordered={false} style={{ ...cardStyle, height: "100%" }} styles={{ body: { padding: "20px 22px 12px" } }}>
            <SectionHeader title="User & Login Activity" extra={<Text type="secondary" style={{ fontSize: 12 }}>Last 6 months</Text>} />
            {userGrowthData.length === 0 ? (
              <Empty description="No data yet" style={{ padding: "60px 0" }} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={userGrowthData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                  <defs>
                    <linearGradient id="adminColorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="adminColorLogins" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#52c41a" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#52c41a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" stroke="#9ca3af" fontSize={11} />
                  <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="users" stroke="#4f46e5" strokeWidth={2} fill="url(#adminColorUsers)" name="New Users" />
                  <Area type="monotone" dataKey="logins" stroke="#52c41a" strokeWidth={2} fill="url(#adminColorLogins)" name="Logins" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12} xl={8}>
          <Card bordered={false} style={{ ...cardStyle, height: "100%" }} styles={{ body: { padding: "20px 22px 12px" } }}>
            <SectionHeader title="Role Distribution" />
            {roleDistribution.length === 0 ? (
              <Empty description="No roles assigned" style={{ padding: "60px 0" }} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={roleDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: "#d1d5db", strokeWidth: 1 }}
                  >
                    {roleDistribution.map((entry, i) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Card bordered={false} style={{ ...cardStyle, height: "100%" }} styles={{ body: { padding: "20px 22px 12px" } }}>
            <SectionHeader title="Lead Uploads" extra={<Text type="secondary" style={{ fontSize: 12 }}>Last 14 days</Text>} />
            {dailyUploads.every((d) => d.count === 0) ? (
              <Empty description="No uploads yet" style={{ padding: "60px 0" }} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyUploads} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} interval="preserveStartEnd" />
                  <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* Charts row 2 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card bordered={false} style={{ ...cardStyle, height: "100%" }} styles={{ body: { padding: "20px 22px 12px" } }}>
            <SectionHeader title="Campaign Lead Status" />
            {leadStatusData.length === 0 ? (
              <Empty description="No campaign leads" style={{ padding: "48px 0" }} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={leadStatusData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="status" stroke="#9ca3af" fontSize={11} width={90} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#722ed1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card bordered={false} style={{ ...cardStyle, height: "100%" }} styles={{ body: { padding: "20px 22px 12px" } }}>
            <SectionHeader title="Sales Pipeline" extra={<Text type="secondary" style={{ fontSize: 12 }}>Last 30 days</Text>} />
            {salesPipeline.every((s) => s.count === 0) ? (
              <Empty description="No sales leads" style={{ padding: "48px 0" }} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={salesPipeline.filter((s) => s.count > 0)} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="stage" stroke="#9ca3af" fontSize={10} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* Campaign performance + Activity */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} xl={14}>
          <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 22px" } }}>
            <SectionHeader
              title="Campaign Performance"
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Top campaigns by lead volume
                </Text>
              }
            />
            {campaignPerformance.length === 0 ? (
              <Empty description="No campaigns yet" />
            ) : (
              <Table
                columns={campaignColumns}
                dataSource={campaignPerformance}
                pagination={false}
                rowKey="id"
                size="small"
                scroll={{ x: 480 }}
                style={{ fontSize: 13 }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card bordered={false} style={{ ...cardStyle, height: "100%" }} styles={{ body: { padding: "20px 22px" } }}>
            <SectionHeader
              title="Recent Activity"
              extra={<Badge count={activityFeed.length} style={{ backgroundColor: "#4f46e5" }} overflowCount={99} />}
            />
            {activityFeed.length === 0 ? (
              <Empty description="No recent activity" style={{ padding: "24px 0" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {activityFeed.map((activity) => (
                  <div key={activity.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <Avatar
                      size={34}
                      style={{
                        backgroundColor: activity.type === "success" ? "#52c41a" : activity.type === "info" ? "#13c2c2" : "#4f46e5",
                        flexShrink: 0,
                        fontSize: 13,
                      }}
                    >
                      {activity.user[0]?.toUpperCase()}
                    </Avatar>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, lineHeight: 1.5, color: "#374151" }}>
                        <Text strong style={{ fontSize: 13 }}>{activity.user}</Text>{" "}
                        <Text type="secondary">{activity.action}</Text>{" "}
                        <Text strong>{activity.target}</Text>
                      </div>
                      <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>
                        {activity.time}
                      </Text>
                    </div>
                    {activity.type === "success" && (
                      <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 14, marginTop: 4, flexShrink: 0 }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Pending tasks + Recent users */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={10}>
          <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 22px" } }}>
            <SectionHeader
              title="Pending Tasks"
              extra={<Badge count={pendingTasks.length} style={{ backgroundColor: "#fa8c16" }} />}
            />
            {pendingTasks.length === 0 ? (
              <Empty description="No pending tasks" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pendingTasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      padding: "12px 14px",
                      border: "1px solid #f0f0f0",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: "#fafafa",
                    }}
                  >
                    <FileTextOutlined style={{ color: "#4f46e5", fontSize: 16 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{task.task}</div>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        Due {task.dueDate}
                      </Text>
                    </div>
                    <Tag
                      color={task.priority === "high" ? "red" : task.priority === "medium" ? "orange" : "default"}
                      style={{ fontSize: 10, margin: 0 }}
                    >
                      {task.priority.toUpperCase()}
                    </Tag>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 22px" } }}>
            <SectionHeader
              title="Recent Users"
              extra={
                <Link href="/admin/users">
                  <Text style={{ fontSize: 12, color: "#4f46e5" }}>
                    View all <RightOutlined style={{ fontSize: 10 }} />
                  </Text>
                </Link>
              }
            />
            {recentUsers.length === 0 ? (
              <Empty description="No new users in the last 24 hours" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                columns={userColumns}
                dataSource={recentUsers}
                pagination={false}
                rowKey="id"
                size="small"
                scroll={{ x: 400 }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Recent sales leads */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 22px" } }}>
            <SectionHeader
              title="Recent Sales Leads"
              extra={
                <Link href="/admin/sales">
                  <Text style={{ fontSize: 12, color: "#4f46e5" }}>
                    Open Sales CRM <RightOutlined style={{ fontSize: 10 }} />
                  </Text>
                </Link>
              }
            />
            {recentSalesLeads.length === 0 ? (
              <Empty description="No sales leads in the last 24 hours" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                columns={salesLeadColumns}
                dataSource={recentSalesLeads}
                pagination={false}
                rowKey="id"
                size="small"
                scroll={{ x: 480 }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
