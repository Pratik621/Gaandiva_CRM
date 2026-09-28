"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  Col,
  Row,
  Typography,
  Tag,
  Table,
  Skeleton,
  Button,
} from "antd";
import {
  FundProjectionScreenOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  SolutionOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

type Stats = {
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
};

type RecentCampaign = {
  id: string;
  name: string;
  status: string;
  campaign_code: string | null;
  leads_uploaded?: number;
  created_at: string;
};

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
} as const;

const statusColors: Record<string, string> = {
  active: "green",
  completed: "success",
  paused: "orange",
  draft: "default",
};

export default function EmmDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch("/api/tl/campaigns/stats", { credentials: "include" }).then((r) => r.json()),
      fetch(
        `/api/qa/campaigns?start_date=${encodeURIComponent(
          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        )}&end_date=${encodeURIComponent(new Date().toISOString().slice(0, 10))}&page=1&limit=8`,
        { credentials: "include" }
      ).then((r) => r.json()),
    ])
      .then(([statsJson, listJson]) => {
        if (cancelled) return;
        if (!statsJson.error) {
          setStats({
            totalCampaigns: statsJson.totalCampaigns ?? 0,
            activeCampaigns: statsJson.activeCampaigns ?? 0,
            totalLeads: statsJson.totalLeads ?? 0,
          });
        }
        if (!listJson.error) {
          setRecent((listJson.campaigns ?? []) as RecentCampaign[]);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const kpi = [
    {
      title: "Total Campaigns",
      value: stats?.totalCampaigns ?? 0,
      icon: <FundProjectionScreenOutlined />,
      color: "#4f46e5",
      bg: "#eef2ff",
    },
    {
      title: "Active Campaigns",
      value: stats?.activeCampaigns ?? 0,
      icon: <CheckCircleOutlined />,
      color: "#52c41a",
      bg: "#f6ffed",
    },
    {
      title: "Total Leads",
      value: stats?.totalLeads ?? 0,
      icon: <TeamOutlined />,
      color: "#722ed1",
      bg: "#f9f0ff",
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          Email Marketing Dashboard
        </Title>
        <Text type="secondary">
          Overview of campaigns and leads for email marketing
        </Text>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {kpi.map((item) => (
          <Col xs={24} sm={8} key={item.title}>
            <Card style={cardStyle} styles={{ body: { padding: "16px 18px" } }}>
              {loading ? (
                <Skeleton active paragraph={{ rows: 1 }} />
              ) : (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: item.bg,
                      color: item.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                    }}
                  >
                    {item.icon}
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.title}
                    </Text>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>
                      {Number(item.value).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card style={cardStyle} title="Quick links">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link href="/emm/lead-finder">
                <Button block icon={<SearchOutlined />}>
                  Lead Finder
                </Button>
              </Link>
              <Link href="/emm/campaigns">
                <Button block icon={<FundProjectionScreenOutlined />}>
                  Campaigns
                </Button>
              </Link>
              <Link href="/emm/leads">
                <Button block icon={<SolutionOutlined />}>
                  Leads
                </Button>
              </Link>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Card
            style={cardStyle}
            title="Recent Campaigns"
            extra={
              <Link href="/emm/campaigns">
                <Button type="link">View all</Button>
              </Link>
            }
          >
            <Table
              rowKey="id"
              size="small"
              loading={loading}
              pagination={false}
              dataSource={recent}
              columns={[
                {
                  title: "Campaign Code",
                  dataIndex: "campaign_code",
                  width: 140,
                  render: (code: string | null, row: RecentCampaign) => (
                    <Link href={`/emm/campaigns/${row.id}`}>
                      <Tag color="blue" style={{ fontFamily: "monospace", fontSize: 12, margin: 0 }}>
                        {code?.trim() || "—"}
                      </Tag>
                    </Link>
                  ),
                },
                {
                  title: "Name",
                  dataIndex: "name",
                  ellipsis: true,
                  render: (name: string, row: RecentCampaign) => (
                    <Link href={`/emm/campaigns/${row.id}`}>{name}</Link>
                  ),
                },
                {
                  title: "Status",
                  dataIndex: "status",
                  width: 100,
                  render: (s: string) => (
                    <Tag color={statusColors[s] ?? "default"}>{s}</Tag>
                  ),
                },
                {
                  title: "Leads",
                  dataIndex: "leads_uploaded",
                  width: 80,
                  render: (v: number | undefined) => (v ?? 0).toLocaleString(),
                },
              ]}
              locale={{ emptyText: "No campaigns yet" }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
