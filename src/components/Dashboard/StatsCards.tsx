"use client";

import { Card, Row, Col, Statistic, Typography } from "antd";
import {
  DollarOutlined,
  TeamOutlined,
  RiseOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

const stats = [
  {
    title: "Total Revenue",
    value: "$124,580",
    change: "+12.5%",
    trend: "up",
    icon: <DollarOutlined />,
    color: "#4f46e5",
  },
  {
    title: "Active Deals",
    value: "48",
    change: "+8",
    trend: "up",
    icon: <RiseOutlined />,
    color: "#52c41a",
  },
  {
    title: "New Contacts",
    value: "1,284",
    change: "+23%",
    trend: "up",
    icon: <TeamOutlined />,
    color: "#722ed1",
  },
  {
    title: "Conversion Rate",
    value: "34%",
    change: "+2.1%",
    trend: "up",
    icon: <CheckCircleOutlined />,
    color: "#f59e0b",
  },
];

export default function StatsCards() {
  return (
    <Row gutter={[24, 24]}>
      {stats.map((stat, index) => (
        <Col xs={24} sm={12} lg={6} key={index}>
          <Card
            bordered={false}
            style={{
              borderRadius: 12,
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <Statistic
              title={
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {stat.title}
                </Text>
              }
              value={stat.value}
              prefix={
                <span
                  style={{
                    marginRight: 8,
                    color: stat.color,
                    fontSize: 20,
                  }}
                >
                  {stat.icon}
                </span>
              }
            />
            <div style={{ marginTop: 8 }}>
              <Text type="success" style={{ fontSize: 13 }}>
                {stat.change} from last month
              </Text>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
