"use client";

import { useEffect, useState } from "react";
import { Card, Row, Col, Typography, Table, Tag, Badge, Avatar, Checkbox, Spin } from "antd";
import DashboardGreeting from "@/components/Dashboard/DashboardGreeting";
import {
  UserAddOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  TrophyOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ClockCircleOutlined,
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

const { Text, Title } = Typography;

const leadTrendData = [
  { date: "Mon", leads: 28, conversions: 9 },
  { date: "Tue", leads: 35, conversions: 12 },
  { date: "Wed", leads: 42, conversions: 15 },
  { date: "Thu", leads: 38, conversions: 13 },
  { date: "Fri", leads: 45, conversions: 18 },
  { date: "Sat", leads: 32, conversions: 10 },
  { date: "Sun", leads: 29, conversions: 8 },
];

const leadSourceData = [
  { name: "Website", value: 435, color: "#4f46e5" },
  { name: "Referral", value: 312, color: "#52c41a" },
  { name: "Social Media", value: 245, color: "#722ed1" },
  { name: "Email Campaign", value: 189, color: "#f59e0b" },
  { name: "Others", value: 66, color: "#6b7280" },
];

const pipelineData = [
  { stage: "New", count: 342, value: 85500 },
  { stage: "Contacted", count: 248, value: 124000 },
  { stage: "Qualified", count: 189, value: 189000 },
  { stage: "Proposal", count: 124, value: 248000 },
  { stage: "Negotiation", count: 87, value: 217500 },
  { stage: "Closed Won", count: 56, value: 336000 },
];

const tasksData = [
  { id: 1, task: "Follow up with Acme Corp", dueTime: "10:00 AM", priority: "high", completed: false },
  { id: 2, task: "Send proposal to TechStart", dueTime: "11:30 AM", priority: "high", completed: false },
  { id: 3, task: "Schedule demo for Global Inc", dueTime: "02:00 PM", priority: "medium", completed: false },
  { id: 4, task: "Review contract terms", dueTime: "03:30 PM", priority: "medium", completed: true },
  { id: 5, task: "Update CRM records", dueTime: "04:00 PM", priority: "low", completed: false },
];

const recentLeadsData = [
  {
    id: 1,
    name: "John Anderson",
    company: "Acme Corporation",
    source: "Website",
    status: "New",
    value: "$12,500",
    time: "2 mins ago",
  },
  {
    id: 2,
    name: "Sarah Williams",
    company: "TechStart Inc",
    source: "Referral",
    status: "Contacted",
    value: "$8,200",
    time: "15 mins ago",
  },
  {
    id: 3,
    name: "Michael Chen",
    company: "Global Solutions",
    source: "Social Media",
    status: "Qualified",
    value: "$24,000",
    time: "1 hour ago",
  },
  {
    id: 4,
    name: "Emma Davis",
    company: "Innovate Labs",
    source: "Email Campaign",
    status: "Proposal",
    value: "$15,800",
    time: "2 hours ago",
  },
  {
    id: 5,
    name: "James Wilson",
    company: "DataFlow Systems",
    source: "Website",
    status: "New",
    value: "$31,200",
    time: "3 hours ago",
  },
];

const activityFeedData = [
  { id: 1, user: "Sarah", action: "closed deal with", target: "Global Solutions", value: "$42,000", time: "5 mins ago", type: "success" },
  { id: 2, user: "Mike", action: "sent proposal to", target: "TechStart Inc", value: "$18,200", time: "12 mins ago", type: "info" },
  { id: 3, user: "Emma", action: "scheduled call with", target: "Acme Corp", value: "$24,500", time: "25 mins ago", type: "info" },
  { id: 4, user: "James", action: "added new lead", target: "Innovate Labs", value: "$15,800", time: "45 mins ago", type: "default" },
  { id: 5, user: "Lisa", action: "updated status for", target: "DataFlow Systems", value: "$31,200", time: "1 hour ago", type: "default" },
];

const statusColors: Record<string, string> = {
  // Matches `LEAD_STATUS_OPTIONS` labels (from salesLeadForm)
  New: "blue",
  Open: "cyan",
  "In progress": "green",
  "Open deal": "purple",
  Unqualified: "red",
  "Attempted to contact": "orange",
  Connected: "success",
  "Bad timing": "default",
};

export default function SalesDashboard() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<null | {
    stats: {
      totalLeads: { value: string; change: string; trend: "up" | "down" | "neutral" };
      todaysLeads: { value: string; change: string; trend: "up" | "down" | "neutral" };
      followUps: { value: string; change: string; trend: "up" | "down" | "neutral" };
      conversion: { value: string; change: string; trend: "up" | "down" | "neutral" };
    };
    pipelineData: typeof pipelineData;
    leadTrendData: typeof leadTrendData;
    leadSourceData: typeof leadSourceData;
    tasksData: typeof tasksData;
    activityFeedData: typeof activityFeedData;
    recentLeadsData: typeof recentLeadsData;
  }>(null);

  // Important: initialize with empty arrays so we never render demo datasets.
  const [pipelineDataLive, setPipelineDataLive] = useState<typeof pipelineData>([]);
  const [leadTrendDataLive, setLeadTrendDataLive] = useState<typeof leadTrendData>([]);
  const [leadSourceDataLive, setLeadSourceDataLive] = useState<typeof leadSourceData>([]);
  const [tasksDataLive, setTasksDataLive] = useState<typeof tasksData>([]);
  const [activityFeedDataLive, setActivityFeedDataLive] = useState<typeof activityFeedData>([]);
  const [recentLeadsDataLive, setRecentLeadsDataLive] = useState<typeof recentLeadsData>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/sales/dashboard", { credentials: "include" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Failed to load dashboard");

        setDashboard(j);
        setPipelineDataLive(j.pipelineData ?? []);
        setLeadTrendDataLive(j.leadTrendData ?? []);
        setLeadSourceDataLive(j.leadSourceData ?? []);
        setTasksDataLive(j.tasksData ?? []);
        setActivityFeedDataLive(j.activityFeedData ?? []);
        setRecentLeadsDataLive(j.recentLeadsData ?? []);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        setPipelineDataLive([]);
        setLeadTrendDataLive([]);
        setLeadSourceDataLive([]);
        setTasksDataLive([]);
        setActivityFeedDataLive([]);
        setRecentLeadsDataLive([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  const statsData = [
    {
      title: "Total Leads",
      value: dashboard?.stats.totalLeads.value ?? "—",
      change: dashboard?.stats.totalLeads.change ?? "—",
      trend: dashboard?.stats.totalLeads.trend ?? "neutral",
      icon: <UserAddOutlined />,
      color: "#4f46e5",
      bgColor: "#eef2ff",
    },
    {
      title: "Today's Leads",
      value: dashboard?.stats.todaysLeads.value ?? "—",
      change: dashboard?.stats.todaysLeads.change ?? "—",
      trend: dashboard?.stats.todaysLeads.trend ?? "neutral",
      icon: <PhoneOutlined />,
      color: "#52c41a",
      bgColor: "#f6ffed",
    },
    {
      title: "Follow-ups",
      value: dashboard?.stats.followUps.value ?? "—",
      change: dashboard?.stats.followUps.change ?? "—",
      trend: dashboard?.stats.followUps.trend ?? "neutral",
      icon: <ClockCircleOutlined />,
      color: "#f59e0b",
      bgColor: "#fffbe6",
    },
    {
      title: "Conversion",
      value: dashboard?.stats.conversion.value ?? "—",
      change: dashboard?.stats.conversion.change ?? "—",
      trend: dashboard?.stats.conversion.trend ?? "neutral",
      icon: <TrophyOutlined />,
      color: "#722ed1",
      bgColor: "#f9f0ff",
    },
  ];

  const leadsColumns = [
    {
      title: "Lead",
      key: "lead",
      render: (record: (typeof recentLeadsData)[number]) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar style={{ backgroundColor: "#4f46e5" }}>{record.name[0]}</Avatar>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{record.name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.company}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: "Source",
      dataIndex: "source",
      key: "source",
      render: (source: string) => <Text style={{ fontSize: 13 }}>{source}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag color={statusColors[status] || "default"} style={{ fontSize: 12 }}>
          {status}
        </Tag>
      ),
    },
    {
      title: "Value",
      dataIndex: "value",
      key: "value",
      render: (value: string) => (
        <Text strong style={{ color: "#52c41a", fontSize: 13 }}>
          {value}
        </Text>
      ),
    },
    {
      title: "Time",
      dataIndex: "time",
      key: "time",
      render: (time: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {time}
        </Text>
      ),
    },
  ];

  return (
    <div style={{ padding: "0 4px" }}>
      <DashboardGreeting />

      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        {statsData.map((stat, index) => (
          <Col xs={24} sm={12} xl={6} key={index}>
            <Card
              bordered={false}
              style={{
                borderRadius: 16,
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                border: "1px solid #f0f0f0",
                transition: "all 0.3s ease",
                cursor: "pointer",
              }}
              styles={{ body: { padding: "24px" } }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
                    {stat.title}
                  </Text>
                  <div style={{ fontSize: 32, fontWeight: 700, color: "#1f1f1f", lineHeight: 1, marginBottom: 12 }}>
                    {stat.value}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {stat.trend === "up" && <ArrowUpOutlined style={{ color: "#52c41a", fontSize: 12 }} />}
                    {stat.trend === "down" && <ArrowDownOutlined style={{ color: "#ef4444", fontSize: 12 }} />}
                    <Text
                      style={{
                        fontSize: 12,
                        color:
                          stat.trend === "up"
                            ? "#52c41a"
                            : stat.trend === "down"
                              ? "#ef4444"
                              : "#6b7280",
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
        <Col xs={24} xl={8}>
          <Card
            title={<Text strong style={{ fontSize: 16 }}>Lead Pipeline</Text>}
            bordered={false}
            style={{
              borderRadius: 16,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              border: "1px solid #f0f0f0",
              height: "100%",
            }}
            styles={{ body: { padding: "24px 24px 16px" } }}
          >
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={pipelineDataLive} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="stage" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #f0f0f0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                  formatter={(value: number, name: string) => [
                    name === "count" ? value : `$${(value / 1000).toFixed(0)}k`,
                    name === "count" ? "Leads" : "Value",
                  ]}
                />
                <Bar dataKey="count" fill="#4f46e5" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Card
            title={<Text strong style={{ fontSize: 16 }}>Lead Trend</Text>}
            bordered={false}
            style={{
              borderRadius: 16,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              border: "1px solid #f0f0f0",
              height: "100%",
            }}
            styles={{ body: { padding: "24px 24px 16px" } }}
          >
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={leadTrendDataLive} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#52c41a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#52c41a" stopOpacity={0} />
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
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorLeads)"
                  name="Leads"
                />
                <Area
                  type="monotone"
                  dataKey="conversions"
                  stroke="#52c41a"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorConversions)"
                  name="Conversions"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Card
            title={<Text strong style={{ fontSize: 16 }}>Lead Source</Text>}
            bordered={false}
            style={{
              borderRadius: 16,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              border: "1px solid #f0f0f0",
              height: "100%",
            }}
            styles={{ body: { padding: "24px 24px 16px" } }}
          >
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={leadSourceDataLive}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: "#d1d5db", strokeWidth: 1 }}
                >
                  {leadSourceDataLive.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #f0f0f0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        <Col xs={24} xl={12}>
          <Card
            title={
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text strong style={{ fontSize: 16 }}>My Tasks</Text>
                <Badge
                  count={tasksDataLive.filter((t) => !t.completed).length}
                  style={{ backgroundColor: "#4f46e5" }}
                />
              </div>
            }
            bordered={false}
            style={{
              borderRadius: 16,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              border: "1px solid #f0f0f0",
            }}
            styles={{ body: { padding: "20px 24px" } }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {tasksDataLive.map((task) => (
                <div
                  key={task.id}
                  style={{
                    padding: "14px 16px",
                    backgroundColor: task.completed ? "#fafafa" : "#fff",
                    border: "1px solid #f0f0f0",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    transition: "all 0.2s ease",
                  }}
                >
                  <Checkbox checked={task.completed} />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: task.completed ? "#6b7280" : "#1f1f1f",
                        textDecoration: task.completed ? "line-through" : "none",
                      }}
                    >
                      {task.task}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      {task.dueTime}
                    </Text>
                  </div>
                  <Tag
                    color={
                      task.priority === "high"
                        ? "red"
                        : task.priority === "medium"
                          ? "orange"
                          : "default"
                    }
                    style={{ fontSize: 11, margin: 0 }}
                  >
                    {task.priority.toUpperCase()}
                  </Tag>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card
            title={<Text strong style={{ fontSize: 16 }}>Activity Feed</Text>}
            bordered={false}
            style={{
              borderRadius: 16,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              border: "1px solid #f0f0f0",
            }}
            styles={{ body: { padding: "20px 24px" } }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {activityFeedDataLive.map((activity) => (
                <div key={activity.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <Avatar
                    size={36}
                    style={{
                      backgroundColor: activity.type === "success" ? "#52c41a" : "#4f46e5",
                      flexShrink: 0,
                    }}
                  >
                    {activity.user[0]}
                  </Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: "#1f1f1f" }}>
                      <Text strong style={{ fontSize: 13 }}>{activity.user}</Text>{" "}
                      <Text type="secondary" style={{ fontSize: 13 }}>{activity.action}</Text>{" "}
                      <Text strong style={{ fontSize: 13 }}>{activity.target}</Text>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                      <Text strong style={{ fontSize: 12, color: "#52c41a" }}>{activity.value}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{activity.time}</Text>
                    </div>
                  </div>
                  {activity.type === "success" && (
                    <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 16, marginTop: 4 }} />
                  )}
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]}>
        <Col xs={24}>
          <Card
            title={
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text strong style={{ fontSize: 16 }}>Recent Leads</Text>
                <Text type="secondary" style={{ fontSize: 13 }}>Latest 7 leads</Text>
              </div>
            }
            bordered={false}
            style={{
              borderRadius: 16,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              border: "1px solid #f0f0f0",
            }}
          >
            <Table
              columns={leadsColumns}
              dataSource={recentLeadsDataLive}
              pagination={false}
              rowKey="id"
              size="middle"
              style={{ fontSize: 13 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

