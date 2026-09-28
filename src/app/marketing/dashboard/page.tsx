"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Col, Row, Statistic, Skeleton, Typography, Table, Tag } from "antd";
import {
  FundProjectionScreenOutlined,
  LinkOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";

const { Title } = Typography;

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
};

const linkStyle = { color: "inherit", textDecoration: "none", display: "block" };

interface DashboardStats {
  campaignCount: number;
  adSourceCount: number;
  leadCount: number;
  statusCounts: { new: number; follow_up: number; in_progress: number; closed: number };
}

interface CampaignRow {
  id: string;
  displayName: string;
  status: string;
  leadCounts: { new: number; follow_up: number; in_progress: number; closed: number; total: number };
}

export default function MarketingDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaignsLoading, setCampaignsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/dashboard");
        const json = await res.json();
        if (!cancelled && res.ok) setStats(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/marketing/campaigns");
        const json = await res.json();
        if (!cancelled && res.ok) setCampaigns(json.campaigns ?? []);
      } finally {
        if (!cancelled) setCampaignsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Marketing Dashboard
      </Title>

      {loading ? (
        <Row gutter={[20, 20]}>
          {[0, 1, 2, 3].map((i) => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <Card bordered={false} style={cardStyle}>
                <Skeleton active paragraph={{ rows: 1 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Row gutter={[20, 20]}>
          <Col xs={24} sm={12} lg={6}>
            <Link href="/marketing/campaigns" style={linkStyle}>
              <Card bordered={false} style={{ ...cardStyle, cursor: "pointer" }} hoverable>
                <Statistic
                  title="Advertise URLs"
                  value={stats?.adSourceCount ?? 0}
                  prefix={<LinkOutlined style={{ color: "#4f46e5" }} />}
                />
              </Card>
            </Link>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Link href="/marketing/campaigns" style={linkStyle}>
              <Card bordered={false} style={{ ...cardStyle, cursor: "pointer" }} hoverable>
                <Statistic
                  title="Campaigns"
                  value={stats?.campaignCount ?? 0}
                  prefix={<FundProjectionScreenOutlined style={{ color: "#4f46e5" }} />}
                />
              </Card>
            </Link>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Link href="/marketing/campaigns?status=new" style={linkStyle}>
              <Card bordered={false} style={{ ...cardStyle, cursor: "pointer" }} hoverable>
                <Statistic
                  title="New Leads"
                  value={stats?.statusCounts.new ?? 0}
                  prefix={<PhoneOutlined style={{ color: "#f59e0b" }} />}
                />
              </Card>
            </Link>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Link href="/marketing/campaigns?status=follow_up" style={linkStyle}>
              <Card bordered={false} style={{ ...cardStyle, cursor: "pointer" }} hoverable>
                <Statistic
                  title="Follow Up"
                  value={stats?.statusCounts.follow_up ?? 0}
                  prefix={<ClockCircleOutlined style={{ color: "#ef4444" }} />}
                />
              </Card>
            </Link>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Link href="/marketing/campaigns?status=in_progress" style={linkStyle}>
              <Card bordered={false} style={{ ...cardStyle, cursor: "pointer" }} hoverable>
                <Statistic
                  title="In Progress"
                  value={stats?.statusCounts.in_progress ?? 0}
                  prefix={<PhoneOutlined style={{ color: "#0284c7" }} />}
                />
              </Card>
            </Link>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Link href="/marketing/campaigns?status=closed" style={linkStyle}>
              <Card bordered={false} style={{ ...cardStyle, cursor: "pointer" }} hoverable>
                <Statistic
                  title="Closed"
                  value={stats?.statusCounts.closed ?? 0}
                  prefix={<CheckCircleOutlined style={{ color: "#16a34a" }} />}
                />
              </Card>
            </Link>
          </Col>
        </Row>
      )}

      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col span={24}>
          <Card
            bordered={false}
            style={cardStyle}
            title="All Campaigns"
            styles={{ body: { padding: campaigns.length === 0 ? "20px 22px" : 0 } }}
          >
            <Table
              rowKey="id"
              loading={campaignsLoading}
              dataSource={campaigns}
              pagination={false}
              columns={[
                {
                  title: "Ad Name",
                  dataIndex: "displayName",
                  render: (displayName: string, row: CampaignRow) => (
                    <Link href={`/marketing/campaigns/${row.id}`}>{displayName}</Link>
                  ),
                },
                { title: "New", dataIndex: ["leadCounts", "new"] },
                { title: "Follow Up", dataIndex: ["leadCounts", "follow_up"] },
                { title: "In Progress", dataIndex: ["leadCounts", "in_progress"] },
                { title: "Closed", dataIndex: ["leadCounts", "closed"] },
                { title: "Total Leads", dataIndex: ["leadCounts", "total"] },
                {
                  title: "Status",
                  dataIndex: "status",
                  render: (status: string) => (
                    <Tag color={status === "active" ? "green" : "default"}>{status}</Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

    </div>
  );
}
