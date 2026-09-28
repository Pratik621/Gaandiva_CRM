"use client";

import { useMemo, type CSSProperties } from "react";
import { Card, Col, Row, Statistic, Tag, Typography } from "antd";
import {
  TeamOutlined,
  SafetyCertificateOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

type UserWithRoles = {
  status: string;
  department: string | null;
  roles?: { name: string }[];
};

const cardStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid #f0f0f0",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
  height: "100%",
};

function topEntries(counts: Record<string, number>, limit = 3): [string, number][] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export default function AdminUserStats({ users }: { users: UserWithRoles[] }) {
  const stats = useMemo(() => {
    const active = users.filter((u) => u.status === "active").length;
    const inactive = users.length - active;

    const roleCounts: Record<string, number> = {};
    let noRole = 0;
    for (const u of users) {
      const names = u.roles?.map((r) => r.name).filter(Boolean) ?? [];
      if (names.length === 0) {
        noRole += 1;
        continue;
      }
      for (const name of names) {
        roleCounts[name] = (roleCounts[name] ?? 0) + 1;
      }
    }

    const deptCounts: Record<string, number> = {};
    for (const u of users) {
      const dept = u.department?.trim() || "Unassigned";
      deptCounts[dept] = (deptCounts[dept] ?? 0) + 1;
    }

    return {
      total: users.length,
      active,
      inactive,
      roleCounts,
      noRole,
      distinctRoles: Object.keys(roleCounts).length,
      deptCounts,
      distinctDepts: Object.keys(deptCounts).length,
      unassignedDept: deptCounts["Unassigned"] ?? 0,
    };
  }, [users]);

  const topRoles = topEntries(stats.roleCounts);
  const topDepts = topEntries(stats.deptCounts).filter(([name]) => name !== "Unassigned");

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={24} sm={12} lg={6}>
        <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 24px" } }}>
          <Statistic
            title={<Text type="secondary">All Users</Text>}
            value={stats.total}
            prefix={<TeamOutlined style={{ color: "#4f46e5", marginRight: 8 }} />}
            valueStyle={{ fontWeight: 600 }}
          />
          <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: "block" }}>
            In your organization
          </Text>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 24px" } }}>
          <Statistic
            title={<Text type="secondary">Roles</Text>}
            value={stats.distinctRoles}
            prefix={<SafetyCertificateOutlined style={{ color: "#722ed1", marginRight: 8 }} />}
            valueStyle={{ fontWeight: 600 }}
            suffix={
              <Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>
                types
              </Text>
            }
          />
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {topRoles.length > 0 ? (
              topRoles.map(([name, count]) => (
                <Tag key={name} style={{ margin: 0, borderRadius: 6 }}>
                  {name} ({count})
                </Tag>
              ))
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                No roles assigned
              </Text>
            )}
            {stats.noRole > 0 && (
              <Tag color="default" style={{ margin: 0, borderRadius: 6 }}>
                Unassigned ({stats.noRole})
              </Tag>
            )}
          </div>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 24px" } }}>
          <Statistic
            title={<Text type="secondary">Departments</Text>}
            value={stats.distinctDepts}
            prefix={<ApartmentOutlined style={{ color: "#13c2c2", marginRight: 8 }} />}
            valueStyle={{ fontWeight: 600 }}
            suffix={
              <Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>
                groups
              </Text>
            }
          />
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {topDepts.length > 0 ? (
              topDepts.map(([name, count]) => (
                <Tag key={name} color="cyan" style={{ margin: 0, borderRadius: 6 }}>
                  {name} ({count})
                </Tag>
              ))
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                No departments set
              </Text>
            )}
            {stats.unassignedDept > 0 && (
              <Tag style={{ margin: 0, borderRadius: 6 }}>
                Unassigned ({stats.unassignedDept})
              </Tag>
            )}
          </div>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card bordered={false} style={cardStyle} styles={{ body: { padding: "20px 24px" } }}>
          <Statistic
            title={<Text type="secondary">Status</Text>}
            value={stats.active}
            prefix={<CheckCircleOutlined style={{ color: "#52c41a", marginRight: 8 }} />}
            valueStyle={{ fontWeight: 600, color: "#52c41a" }}
            suffix={
              <Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>
                active
              </Text>
            }
          />
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Tag color="success" style={{ margin: 0, borderRadius: 6 }}>
              Active {stats.active}
            </Tag>
            <Tag color="default" style={{ margin: 0, borderRadius: 6 }}>
              Inactive {stats.inactive}
            </Tag>
          </div>
        </Card>
      </Col>
    </Row>
  );
}
