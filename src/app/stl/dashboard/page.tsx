"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardGreeting from "@/components/Dashboard/DashboardGreeting";
import { useRouter } from "next/navigation";
import {
  Card,
  Row,
  Col,
  Typography,
  Tag,
  Table,
  Button,
  Empty,
} from "antd";
import {
  FundProjectionScreenOutlined,
  RiseOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  ArrowUpOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { useSTLDashboard } from "@/hooks/useSTLDashboard";
import {
  StatCardsRowSkeleton,
  TableSkeleton,
} from "@/components/Dashboard/DashboardSkeletons";
import {
  TLLeadTrendChart,
  TLCampaignPerformanceChart,
  TLCampaignStatusPieChart,
} from "@/components/Dashboard/TLDashboardCharts";

const { Text, Title } = Typography;

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
  transition: "all 0.3s ease",
  cursor: "pointer" as const,
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

export default function SeniorTeamLeaderDashboardPage() {
  const router = useRouter();
  const { isInitialized, hasRole } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const hasSTLAccess = hasRole("stl") || hasRole("operations_manager") || hasRole("admin");

  const enabled = Boolean(isInitialized && hasSTLAccess);
  const { stats, campaigns, refetch } = useSTLDashboard(enabled);

  // Auth guard is handled by the layout (useRoleGuard). No redirect needed here.

  useEffect(() => {
    if (!isInitialized) return;
    if (hasRole("operations_manager")) {
      router.replace("/om/dashboard");
    }
  }, [hasRole, isInitialized, router]);

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

  const statsData = stats.data;
  const statsCards = useMemo(() => {
    const s = statsData ?? {
      totalCampaigns: 0,
      activeCampaigns: 0,
      totalLeads: 0,
      qualifiedLeads: 0,
      qualifiedRatePct: 0,
    };
    return [
      {
        title: "Total Campaigns",
        value: String(s.totalCampaigns),
        change: "All time",
        trend: "neutral" as const,
        icon: <FundProjectionScreenOutlined />,
        color: "#4f46e5",
        bgColor: "#eef2ff",
      },
      {
        title: "Active Campaigns",
        value: String(s.activeCampaigns),
        change: "Running now",
        trend: "up" as const,
        icon: <RiseOutlined />,
        color: "#52c41a",
        bgColor: "#f6ffed",
      },
      {
        title: "Total Leads",
        value: String(s.totalLeads),
        change: "Across campaigns",
        trend: "neutral" as const,
        icon: <TeamOutlined />,
        color: "#722ed1",
        bgColor: "#f9f0ff",
      },
      {
        title: "Qualified rate",
        value: `${s.qualifiedRatePct}%`,
        change: `${s.qualifiedLeads} of ${s.totalLeads} leads`,
        trend: "up" as const,
        icon: <CheckCircleOutlined />,
        color: "#52c41a",
        bgColor: "#f6ffed",
      },
    ];
  }, [statsData]);

  const recentCampaigns = useMemo(() => {
    const list = campaigns.data?.campaigns ?? [];
    return list.slice(0, 5);
  }, [campaigns.data?.campaigns]);

  const campaignPerformanceData = useMemo(() => {
    const list = campaigns.data?.campaigns ?? [];
    if (list.length === 0) return [];

    return [...list]
      .sort((a, b) => (b.total_leads ?? 0) - (a.total_leads ?? 0))
      .slice(0, 5)
      .map((c) => {
        const shortName =
          c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name;
        return {
          name: shortName,
          leads: c.total_leads ?? 0,
          qualified: c.qualified_leads ?? 0,
        };
      });
  }, [campaigns.data?.campaigns]);

  const campaignStatusPie = useMemo(() => {
    const s = statsData;
    const total = s?.totalCampaigns ?? 0;
    const active = s?.activeCampaigns ?? 0;
    return [
      { name: "Active", value: active, color: "#52c41a" },
      { name: "Paused", value: Math.max(0, total - active - 1), color: "#f59e0b" },
      { name: "Draft", value: 1, color: "#6b7280" },
      { name: "Completed", value: 0, color: "#4f46e5" },
    ].filter((d) => d.value > 0);
  }, [statsData]);

  if (!isInitialized || !hasSTLAccess) {
    return null;
  }

  const statsReady = Boolean(statsData);
  const campaignsReady = campaigns.isSuccess;

  return (
    <div style={{ padding: "0 4px" }}>
      <DashboardGreeting />

      {isOffline && (
        <div style={{ marginBottom: 24 }}>
          <Text type="danger" style={{ fontSize: 14 }}>
            You appear to be offline. Data will reload when back online, or{" "}
            <a onClick={(e) => { e.preventDefault(); refetch(); }}>retry now</a>.
          </Text>
        </div>
      )}

      {!statsReady ? (
        <StatCardsRowSkeleton />
      ) : (
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
                      <Text style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{stat.change}</Text>
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
      )}

      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        <Col xs={24} xl={8}>
          <TLLeadTrendChart data={statsData?.leadTrend ?? []} />
        </Col>
        <Col xs={24} xl={8}>
          <TLCampaignPerformanceChart data={campaignPerformanceData} />
        </Col>
        <Col xs={24} xl={8}>
          <TLCampaignStatusPieChart data={campaignStatusPie} />
        </Col>
      </Row>

      {!campaignsReady ? (
        <TableSkeleton rows={5} />
      ) : (
        <Row gutter={[20, 20]}>
          <Col xs={24}>
            <Card
              title={
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Text strong style={{ fontSize: 16 }}>
                    Recent Campaigns
                  </Text>
                  {recentCampaigns.length > 0 ? <Link href="/stl/campaigns">View all</Link> : null}
                </div>
              }
              bordered={false}
              style={cardStyle}
            >
              {recentCampaigns.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No campaigns yet" />
              ) : (
                <Table
                  dataSource={recentCampaigns}
                  rowKey="id"
                  pagination={false}
                  size="middle"
                  columns={[
                    {
                      title: "Sr. No",
                      key: "srno",
                      width: 70,
                      render: (_: unknown, __: unknown, index: number) => index + 1,
                    },
                    {
                      title: "Campaign",
                      key: "name",
                      render: (_, r) => (
                        <Link href={`/stl/campaigns/${r.id}`} style={{ fontWeight: 600, fontSize: 14 }}>
                          {r.name}
                        </Link>
                      ),
                    },
                    {
                      title: "Status",
                      dataIndex: "status",
                      key: "status",
                      render: (s: string) => <Tag color={statusColors[s] ?? "default"}>{s}</Tag>,
                    },
                    { title: "Leads", dataIndex: "total_leads", key: "total_leads", width: 90 },
                    { title: "Agents", dataIndex: "total_agents", key: "total_agents", width: 90 },
                    {
                      title: "",
                      key: "action",
                      render: (_, r) => (
                        <Link href={`/stl/campaigns/${r.id}`}>
                          <Button type="link" icon={<RightOutlined />}>
                            View
                          </Button>
                        </Link>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
