"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Row, Col, Typography, Table, Tag, Avatar, Progress, Spin, Empty, DatePicker } from "antd";
import DashboardGreeting from "@/components/Dashboard/DashboardGreeting";
import dayjs, { type Dayjs } from "dayjs";
import {
  FundProjectionScreenOutlined,
  TeamOutlined,
  DollarOutlined,
  RiseOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const { Text } = Typography;

type Trend = "up" | "down" | "neutral";

type StatCard = {
  value: string;
  change: string;
  trend: Trend;
};

type TeamMemberRow = {
  key: string;
  name: string;
  deals: number;
  revenue: string;
  conversion: number;
  trend: Trend;
  status: string;
};

type ActivityRow = {
  id: string;
  user: string;
  action: string;
  target: string;
  value: string;
  time: string;
  type: string;
};

type CampaignRevenueRow = {
  key: string;
  name: string;
  status: string;
  cpl: number;
  achieved: number;
  revenue: number;
  revenueLabel: string;
};

type ManagerDashboardData = {
  stats: {
    campaigns: StatCard;
    clients: StatCard;
    teamRevenue: StatCard;
    avgConversion: StatCard;
  };
  campaignRevenueTrend: { name: string; fullName?: string; revenue: number }[];
  campaignRevenueData: CampaignRevenueRow[];
  latestCampaigns: {
    id: string;
    name: string;
    status: string;
    achieved: number;
    allocation: number;
    percent: number;
    revenue?: number;
    revenueLabel?: string;
    color: string;
    dateLabel?: string | null;
  }[];
  repPerformanceData: {
    name: string;
    leads: number;
    deals: number;
    activities?: number;
    revenue: number;
  }[];
  recentActivities: ActivityRow[];
  teamMembers: TeamMemberRow[];
};

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
  transition: "all 0.3s ease",
  cursor: "pointer" as const,
};

export default function SalesManagerDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs().endOf("day"),
  ]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          start_date: dateRange[0].format("YYYY-MM-DD"),
          end_date: dateRange[1].format("YYYY-MM-DD"),
        });
        const res = await fetch(`/api/sales/manager-dashboard?${params.toString()}`, {
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Failed to load dashboard");
        setData(j);
      } catch (e) {
        console.error(e);
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [dateRange]);

  const statsCards = useMemo(() => {
    const s = data?.stats;
    return [
      {
        title: "Total Campaigns",
        value: s?.campaigns.value ?? "0",
        change: s?.campaigns.change ?? "—",
        trend: s?.campaigns.trend ?? "neutral",
        icon: <FundProjectionScreenOutlined />,
        color: "#4f46e5",
        bgColor: "#eef2ff",
      },
      {
        title: "Total Clients",
        value: s?.clients.value ?? "0",
        change: s?.clients.change ?? "—",
        trend: s?.clients.trend ?? "neutral",
        icon: <TeamOutlined />,
        color: "#52c41a",
        bgColor: "#f6ffed",
      },
      {
        title: "Total Revenue",
        value: s?.teamRevenue.value ?? "$0",
        change: s?.teamRevenue.change ?? "—",
        trend: s?.teamRevenue.trend ?? "neutral",
        icon: <DollarOutlined />,
        color: "#722ed1",
        bgColor: "#f9f0ff",
      },
      {
        title: "Avg. Conversion",
        value: s?.avgConversion.value ?? "0%",
        change: s?.avgConversion.change ?? "—",
        trend: s?.avgConversion.trend ?? "neutral",
        icon: <RiseOutlined />,
        color: "#f59e0b",
        bgColor: "#fffbe6",
      },
    ];
  }, [data]);

  const campaignRevenueTrend = data?.campaignRevenueTrend ?? [];
  const campaignRevenueData = data?.campaignRevenueData ?? [];
  const latestCampaigns = data?.latestCampaigns ?? [];
  const repPerformanceData = data?.repPerformanceData ?? [];
  const recentActivities = data?.recentActivities ?? [];
  const teamMembers = data?.teamMembers ?? [];

  const campaignRevenueColumns = [
    {
      title: "Campaign",
      dataIndex: "name",
      key: "name",
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => {
        const s = status.toLowerCase();
        const color =
          s === "active" ? "success" : s === "paused" ? "warning" : s === "completed" ? "blue" : "default";
        const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : status;
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "CPL",
      dataIndex: "cpl",
      key: "cpl",
      render: (v: number) => <Text>${Number(v).toLocaleString()}</Text>,
    },
    {
      title: "Achieved",
      dataIndex: "achieved",
      key: "achieved",
      render: (v: number) => <Text strong>{v}</Text>,
    },
    {
      title: "Earned Revenue",
      dataIndex: "revenueLabel",
      key: "revenue",
      render: (v: string) => (
        <Text strong style={{ color: "#52c41a" }}>
          {v}
        </Text>
      ),
    },
  ];

  const teamColumns = [
    {
      title: "Sales Rep",
      key: "name",
      render: (record: TeamMemberRow) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar style={{ backgroundColor: "#4f46e5", flexShrink: 0 }}>{record.name[0]?.toUpperCase()}</Avatar>
          <Text strong style={{ fontSize: 14 }}>
            {record.name}
          </Text>
        </div>
      ),
    },
    {
      title: "Deals Closed",
      dataIndex: "deals",
      key: "deals",
      render: (v: number) => <Text strong>{v}</Text>,
    },
    {
      title: "Revenue",
      dataIndex: "revenue",
      key: "revenue",
      render: (v: string) => (
        <Text strong style={{ color: "#52c41a" }}>
          {v}
        </Text>
      ),
    },
    {
      title: "Conversion Rate",
      dataIndex: "conversion",
      key: "conversion",
      render: (v: number) => (
        <div style={{ minWidth: 150 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 12 }}>{v}%</Text>
          </div>
          <Progress
            percent={v}
            size="small"
            showInfo={false}
            strokeColor={v >= 35 ? "#52c41a" : v >= 28 ? "#f59e0b" : "#ef4444"}
          />
        </div>
      ),
    },
    {
      title: "Trend",
      dataIndex: "trend",
      key: "trend",
      render: (trend: Trend) =>
        trend === "up" ? (
          <Tag color="success" icon={<ArrowUpOutlined />}>
            Up
          </Tag>
        ) : trend === "down" ? (
          <Tag color="error" icon={<ArrowDownOutlined />}>
            Down
          </Tag>
        ) : (
          <Tag>Flat</Tag>
        ),
    },
  ];

  if (loading && !data) {
    return (
      <div style={{ padding: "0 4px" }}>
        <DashboardGreeting
          extra={
            <DatePicker.RangePicker
              value={dateRange}
              onChange={(range) => {
                if (!range || range.length !== 2 || !range[0] || !range[1]) return;
                setDateRange([range[0].startOf("day"), range[1].endOf("day")]);
              }}
              allowClear={false}
              format="DD MMM YYYY"
              style={{ width: 280 }}
            />
          }
        />
        <div style={{ minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin size="large" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 4px" }}>
      <DashboardGreeting
        extra={
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(range) => {
              if (!range || range.length !== 2 || !range[0] || !range[1]) return;
              setDateRange([range[0].startOf("day"), range[1].endOf("day")]);
            }}
            allowClear={false}
            format="DD MMM YYYY"
            style={{ width: 280 }}
          />
        }
      />

      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        {statsCards.map((stat, index) => (
          <Col xs={24} sm={12} xl={6} key={index}>
            <Card
              bordered={false}
              style={cardStyle}
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
                  <div
                    style={{ fontSize: 32, fontWeight: 700, color: "#1f1f1f", lineHeight: 1, marginBottom: 12 }}
                  >
                    {stat.value}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {stat.trend === "up" && <ArrowUpOutlined style={{ color: "#52c41a", fontSize: 12 }} />}
                    {stat.trend === "down" && <ArrowDownOutlined style={{ color: "#ef4444", fontSize: 12 }} />}
                    <Text
                      style={{
                        fontSize: 12,
                        color:
                          stat.trend === "up" ? "#52c41a" : stat.trend === "down" ? "#ef4444" : "#6b7280",
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

      <Row gutter={[20, 20]} style={{ marginBottom: 24 }} align="stretch">
        <Col xs={24} xl={14}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
            <Card
              title={<Text strong style={{ fontSize: 16 }}>Campaign Revenue Trend</Text>}
              bordered={false}
              style={cardStyle}
              styles={{ body: { padding: "20px 20px 12px" } }}
            >
              {campaignRevenueTrend.length === 0 ? (
                <Empty description="No campaign revenue yet" style={{ padding: "32px 0" }} />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={campaignRevenueTrend} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={11} interval={0} />
                    <YAxis
                      stroke="#6b7280"
                      fontSize={11}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                      }
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #f0f0f0",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                      formatter={(v: number) => [
                        `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                        "Revenue",
                      ]}
                      labelFormatter={(_label, payload) => {
                        const row = payload?.[0]?.payload as { fullName?: string; name?: string } | undefined;
                        return row?.fullName || row?.name || "";
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="revenue"
                      fill="#4f46e5"
                      radius={[6, 6, 0, 0]}
                      name="Earned Revenue"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card
              title={<Text strong style={{ fontSize: 16 }}>Rep Performance</Text>}
              bordered={false}
              style={{ ...cardStyle, flex: 1 }}
              styles={{ body: { padding: "20px 20px 12px" } }}
            >
              {repPerformanceData.length === 0 ? (
                <Empty description="No rep activity found" style={{ padding: "32px 0" }} />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={repPerformanceData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #f0f0f0",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                      formatter={(v: number, name: string) => {
                        if (name === "revenue") return [`$${v}k`, "Revenue"];
                        if (name === "leads") return [v, "Leads"];
                        if (name === "activities") return [v, "Activities"];
                        return [v, "Deals"];
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="leads" fill="#722ed1" radius={[6, 6, 0, 0]} name="Leads" />
                    <Bar dataKey="deals" fill="#4f46e5" radius={[6, 6, 0, 0]} name="Deals" />
                    <Bar dataKey="activities" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Activities" />
                    <Bar dataKey="revenue" fill="#52c41a" radius={[6, 6, 0, 0]} name="Revenue ($k)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </Col>

        <Col xs={24} xl={10}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
            <Card
              title={
                <Text strong style={{ fontSize: 16 }}>
                  Campaign Progress
                  {latestCampaigns.length > 0 ? (
                    <Text type="secondary" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
                      ({latestCampaigns.length})
                    </Text>
                  ) : null}
                </Text>
              }
              bordered={false}
              style={cardStyle}
              styles={{ body: { padding: "16px 20px 20px" } }}
            >
              {latestCampaigns.length === 0 ? (
                <Empty description="No campaigns in selected dates" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 420, overflowY: "auto" }}>
                  {latestCampaigns.map((campaign) => (
                    <div key={campaign.id}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 4,
                          gap: 8,
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Text style={{ fontSize: 13, display: "block" }} ellipsis={{ tooltip: campaign.name }}>
                            {campaign.name}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {campaign.dateLabel ? `${campaign.dateLabel} · ` : ""}
                            {campaign.status}
                            {campaign.revenueLabel ? ` · ${campaign.revenueLabel}` : ""}
                          </Text>
                        </div>
                        <Text strong style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                          {campaign.achieved}/{campaign.allocation || 0} ({campaign.percent}%)
                        </Text>
                      </div>
                      <Progress
                        percent={campaign.percent}
                        showInfo={false}
                        strokeColor={campaign.color || (
                          campaign.percent >= 100
                            ? "#52c41a"
                            : campaign.percent > 50
                              ? "#1677ff"
                              : "#f59e0b"
                        )}
                        size="small"
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title={<Text strong style={{ fontSize: 16 }}>Recent Team Activity</Text>}
              bordered={false}
              style={{ ...cardStyle, flex: 1 }}
              styles={{ body: { padding: "16px 20px 20px" } }}
            >
              {recentActivities.length === 0 ? (
                <Empty description="No recent activity" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 280, overflowY: "auto" }}>
                  {recentActivities.map((activity) => (
                    <div key={activity.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <Avatar
                        size={34}
                        style={{
                          backgroundColor: activity.type === "success" ? "#52c41a" : "#4f46e5",
                          flexShrink: 0,
                          fontSize: 13,
                        }}
                      >
                        {activity.user[0]?.toUpperCase()}
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, lineHeight: 1.5, color: "#1f1f1f" }}>
                          <Text strong style={{ fontSize: 13 }}>
                            {activity.user}
                          </Text>{" "}
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            {activity.action}
                          </Text>{" "}
                          <Text strong style={{ fontSize: 13 }}>
                            {activity.target}
                          </Text>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 3 }}>
                          {activity.value !== "—" && (
                            <Text strong style={{ fontSize: 12, color: "#52c41a" }}>
                              {activity.value}
                            </Text>
                          )}
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {activity.time}
                          </Text>
                        </div>
                      </div>
                      {activity.type === "success" && (
                        <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 15, marginTop: 3 }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        <Col xs={24}>
          <Card
            title={<Text strong style={{ fontSize: 16 }}>Campaign-wise Revenue</Text>}
            bordered={false}
            style={cardStyle}
          >
            {campaignRevenueData.length === 0 ? (
              <Empty description="No campaigns found" />
            ) : (
              <Table
                columns={campaignRevenueColumns}
                dataSource={campaignRevenueData}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                rowKey="key"
                size="middle"
                scroll={{ x: 720 }}
              />
            )}
          </Card>
        </Col>
      </Row>

      
    </div>
  );
}
