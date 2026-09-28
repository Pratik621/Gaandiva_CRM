"use client";

import React from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ReloadOutlined,
  TeamOutlined,
  UserOutlined,
  CrownOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import type { STLHierarchyData, STLNode, TeamLeaderMember } from "@/lib/stl/team-hierarchy";
import { getSTLLabel, getTeamLeaderMemberLabel } from "@/lib/stl/team-hierarchy";
import type { TeamMember } from "@/lib/tl/team-hierarchy";
import { getTeamMemberLabel } from "@/lib/tl/team-hierarchy";
import { useCachedApiQuery } from "@/hooks/useCachedApiQuery";

const { Text, Title } = Typography;

const REFRESH_MS = 45_000;

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid #f0f0f0",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  height: "100%",
};

const stlHeaderStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
  borderRadius: "12px 12px 0 0",
  margin: -24,
  marginBottom: 20,
  padding: "20px 24px",
  color: "#fff",
};

const connectorStyle: React.CSSProperties = {
  width: 2,
  height: 20,
  background: "#d1d5db",
  margin: "0 auto 12px",
  borderRadius: 1,
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function TeamLeaderChip({ member }: { member: TeamLeaderMember }) {
  const label = getTeamLeaderMemberLabel(member);
  return (
    <Tooltip title={member.email ?? undefined}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: "#fafafa",
          borderRadius: 10,
          border: "1px solid #f0f0f0",
        }}
      >
        <Avatar size={32} style={{ background: "#52c41a", flexShrink: 0 }}>
          {initials(label)}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <Text strong style={{ fontSize: 13, display: "block" }} ellipsis>
            {label}
          </Text>
          {member.email && (
            <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
              {member.email}
            </Text>
          )}
        </div>
      </div>
    </Tooltip>
  );
}

function AgentChip({ agent }: { agent: TeamMember }) {
  const label = getTeamMemberLabel(agent);
  return (
    <Tooltip title={agent.email ?? undefined}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #f0f0f0",
        }}
      >
        <Avatar size={24} style={{ background: "#4f46e5", flexShrink: 0, fontSize: 11 }}>
          {initials(label)}
        </Avatar>
        <Text style={{ fontSize: 12 }} ellipsis>
          {label}
        </Text>
      </div>
    </Tooltip>
  );
}

/** Team Leader name + their agents nested below — mirrors OM's /tl/team card layout. */
function TeamLeaderSection({ member }: { member: TeamLeaderMember }) {
  const label = getTeamLeaderMemberLabel(member);
  const agents = member.agents ?? [];

  return (
    <div
      style={{
        border: "1px solid #f0f0f0",
        borderRadius: 12,
        padding: 14,
        background: "#fafafa",
      }}
    >
      <Space align="center" size={10} style={{ marginBottom: 10 }}>
        <Avatar size={32} style={{ background: "#52c41a", flexShrink: 0 }}>
          {initials(label)}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <Text strong style={{ fontSize: 13, display: "block" }} ellipsis>
            {label}
          </Text>
          {member.email && (
            <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
              {member.email}
            </Text>
          )}
        </div>
        <Tag color="blue" style={{ margin: 0 }}>
          {agents.length} {agents.length === 1 ? "Agent" : "Agents"}
        </Tag>
      </Space>

      {agents.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          No agents assigned yet
        </Text>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 8,
          }}
        >
          {agents.map((agent) => (
            <AgentChip key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function STLCard({ node }: { node: STLNode }) {
  const label = getSTLLabel(node);

  return (
    <Card style={cardStyle} styles={{ body: { paddingTop: 24 } }}>
      <div style={stlHeaderStyle}>
        <Space align="start" size={14}>
          <Avatar
            size={48}
            style={{ background: "rgba(255,255,255,0.25)", border: "2px solid rgba(255,255,255,0.5)" }}
            icon={<CrownOutlined />}
          >
            {initials(label)}
          </Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>Senior Team Leader</Text>
            <Title level={5} style={{ color: "#fff", margin: "2px 0 8px" }}>
              {label}
            </Title>
            <Space size={8} wrap>
              <Tag color="blue" style={{ margin: 0, border: "none", background: "rgba(255,255,255,0.2)", color: "#fff" }}>
                {node.team_leader_count} {node.team_leader_count === 1 ? "Team Leader" : "Team Leaders"}
              </Tag>
              <Tag style={{ margin: 0, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff" }}>
                {node.campaign_count} {node.campaign_count === 1 ? "Campaign" : "Campaigns"}
              </Tag>
            </Space>
          </div>
        </Space>
      </div>

      <div style={connectorStyle} />

      {node.team_leaders.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No Team Leaders assigned yet"
          style={{ margin: "8px 0" }}
        />
      ) : (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {node.team_leaders.map((member) => (
            <TeamLeaderSection key={member.id} member={member} />
          ))}
        </Space>
      )}
    </Card>
  );
}

export default function STLTeamHierarchyView() {
  const { hasRole } = useAuth();
  const isOperationsManager = hasRole("operations_manager") || hasRole("admin");

  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useCachedApiQuery<STLHierarchyData & { updated_at?: string; scope?: string }>(
    ["stl", "team", "hierarchy"],
    "/api/stl/team/hierarchy",
    { refetchInterval: REFRESH_MS }
  );

  const loading = isLoading && !data;
  const refreshing = isFetching && Boolean(data);
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load team"
    : null;

  if (loading && !data) {
    return (
      <Space direction="vertical" size={24} style={{ width: "100%" }}>
        <Row gutter={[16, 16]}>
          {[1, 2, 3, 4].map((k) => (
            <Col xs={12} sm={6} key={k}>
              <Card style={cardStyle}>
                <Skeleton active paragraph={{ rows: 1 }} />
              </Card>
            </Col>
          ))}
        </Row>
        <Row gutter={[20, 20]}>
          {[1, 2].map((k) => (
            <Col xs={24} lg={12} key={k}>
              <Card style={cardStyle}>
                <Skeleton active paragraph={{ rows: 6 }} />
              </Card>
            </Col>
          ))}
        </Row>
      </Space>
    );
  }

  if (error && !data) {
    return (
      <Card style={cardStyle}>
        <Empty description={error}>
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => void refetch()}>
            Retry
          </Button>
        </Empty>
      </Card>
    );
  }

  const stats = data?.stats;
  const stls = data?.stls ?? [];
  const unassigned = data?.unassigned_team_leaders ?? [];

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          {data?.updated_at && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              Last updated {new Date(data.updated_at).toLocaleTimeString()} · auto-refreshes every{" "}
              {REFRESH_MS / 1000}s
            </Text>
          )}
        </div>
        <Button
          icon={<ReloadOutlined spin={refreshing} />}
          onClick={() => void refetch()}
          loading={refreshing}
        >
          Refresh
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card style={cardStyle}>
            <Statistic
              title="Senior Team Leaders"
              value={stats?.stl_count ?? 0}
              prefix={<CrownOutlined style={{ color: "#4f46e5" }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={cardStyle}>
            <Statistic
              title="Total Team Leaders"
              value={stats?.total_team_leaders ?? 0}
              prefix={<TeamOutlined style={{ color: "#52c41a" }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={cardStyle}>
            <Statistic
              title="Assigned"
              value={stats?.assigned_team_leaders ?? 0}
              prefix={<UserOutlined style={{ color: "#722ed1" }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={cardStyle}>
            <Statistic
              title="Unassigned"
              value={stats?.unassigned_team_leaders ?? 0}
              prefix={<WarningOutlined style={{ color: stats?.unassigned_team_leaders ? "#f59e0b" : "#9ca3af" }} />}
              valueStyle={{ color: stats?.unassigned_team_leaders ? "#f59e0b" : undefined }}
            />
          </Card>
        </Col>
      </Row>

      {isOperationsManager && stls.length > 1 && (
        <Card style={{ ...cardStyle, background: "#fafafa" }} styles={{ body: { padding: "16px 20px" } }}>
          <Space wrap size="middle" style={{ width: "100%", justifyContent: "center" }}>
            {stls.map((s) => (
              <Badge
                key={s.id}
                count={s.team_leader_count}
                overflowCount={99}
                style={{ backgroundColor: "#4f46e5" }}
              >
                <Tag style={{ padding: "6px 14px", fontSize: 13, borderRadius: 20 }}>
                  {getSTLLabel(s)}
                </Tag>
              </Badge>
            ))}
          </Space>
        </Card>
      )}

      {stls.length === 0 ? (
        <Card style={cardStyle}>
          <Empty description="No Senior Team Leaders found in your organization" />
        </Card>
      ) : (
        <Row gutter={[20, 20]}>
          {stls.map((s) => (
            <Col xs={24} lg={isOperationsManager ? 12 : 24} xl={isOperationsManager ? 8 : 24} key={s.id}>
              <STLCard node={s} />
            </Col>
          ))}
        </Row>
      )}

      {isOperationsManager && unassigned.length > 0 && (
        <Card
          style={{ ...cardStyle, borderColor: "#ffe7ba" }}
          title={
            <Space>
              <WarningOutlined style={{ color: "#f59e0b" }} />
              <span>Unassigned Team Leaders</span>
              <Tag color="orange">{unassigned.length}</Tag>
            </Space>
          }
        >
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            These Team Leaders are not linked to a Senior Team Leader.
          </Text>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            {unassigned.map((member) => (
              <TeamLeaderChip key={member.id} member={member} />
            ))}
          </div>
        </Card>
      )}
    </Space>
  );
}
