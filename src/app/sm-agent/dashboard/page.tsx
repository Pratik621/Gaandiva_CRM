"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Col, Row, Statistic, Skeleton, Typography, Alert } from "antd";
import {
  TeamOutlined,
  PhoneOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

const { Title } = Typography;

const cardStyle = {
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  border: "1px solid #f0f0f0",
};

interface AgentDashboardStats {
  totalAssigned: number;
  newLeads: number;
  followUpsDueToday: number;
  overdueFollowUps: number;
  closedLeads: number;
}

const TILES: { key: keyof AgentDashboardStats; title: string; icon: React.ReactNode; color: string; href: string }[] = [
  { key: "totalAssigned", title: "Total Assigned Leads", icon: <TeamOutlined />, color: "#4f46e5", href: "/sm-agent/leads" },
  { key: "newLeads", title: "New Leads", icon: <PhoneOutlined />, color: "#f59e0b", href: "/sm-agent/leads?status=new" },
  { key: "followUpsDueToday", title: "Follow-ups Due Today", icon: <ClockCircleOutlined />, color: "#0284c7", href: "/sm-agent/leads?status=follow_up" },
  { key: "overdueFollowUps", title: "Overdue Follow-ups", icon: <WarningOutlined />, color: "#ef4444", href: "/sm-agent/leads?status=follow_up" },
  { key: "closedLeads", title: "Closed Leads", icon: <CheckCircleOutlined />, color: "#16a34a", href: "/sm-agent/leads?status=closed" },
];

export default function SmAgentDashboardPage() {
  const [stats, setStats] = useState<AgentDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sm-agent/dashboard");
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setStats(json);
          setError(null);
        } else {
          setError(json.error || `Request failed (HTTP ${res.status})`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        My Dashboard
      </Title>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Couldn't load dashboard data"
          description={error}
          style={{ marginBottom: 20 }}
        />
      )}

      <Row gutter={[20, 20]}>
        {TILES.map((tile) => (
          <Col xs={24} sm={12} lg={6} key={tile.key}>
            <Link href={tile.href} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
              <Card bordered={false} style={{ ...cardStyle, cursor: "pointer" }} hoverable>
                {loading ? (
                  <Skeleton active paragraph={{ rows: 1 }} />
                ) : (
                  <Statistic
                    title={tile.title}
                    value={stats?.[tile.key] ?? 0}
                    prefix={<span style={{ color: tile.color }}>{tile.icon}</span>}
                  />
                )}
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  );
}
