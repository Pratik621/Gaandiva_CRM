"use client";

import { Card, Timeline, Typography, Avatar } from "antd";
import {
  UserAddOutlined,
  CheckCircleOutlined,
  MailOutlined,
  PhoneOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

const activities = [
  {
    color: "blue",
    icon: <UserAddOutlined />,
    title: "New contact added",
    desc: "Sarah Johnson from Acme Corp",
    time: "2 min ago",
  },
  {
    color: "green",
    icon: <CheckCircleOutlined />,
    title: "Deal closed",
    desc: "Global Solutions - $42,000",
    time: "1 hour ago",
  },
  {
    color: "cyan",
    icon: <MailOutlined />,
    title: "Email sent",
    desc: "Follow-up to Mike Chen",
    time: "2 hours ago",
  },
  {
    color: "orange",
    icon: <PhoneOutlined />,
    title: "Call scheduled",
    desc: "James Brown - Tomorrow 10am",
    time: "3 hours ago",
  },
];

export default function ActivityFeed() {
  return (
    <Card
      title={<Text strong style={{ fontSize: 16 }}>Activity Feed</Text>}
      bordered={false}
      style={{
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <Timeline
        items={activities.map((a) => ({
          color: a.color,
          dot: (
            <Avatar
              size="small"
              icon={a.icon}
              style={{
                backgroundColor:
                  a.color === "blue" ? "#4f46e5" :
                  a.color === "green" ? "#52c41a" :
                  a.color === "cyan" ? "#13c2c2" : "#f59e0b",
              }}
            />
          ),
          children: (
            <div>
              <div>
                <Text strong>{a.title}</Text>
              </div>
              <Text type="secondary" style={{ fontSize: 13 }}>{a.desc}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>{a.time}</Text>
              </div>
            </div>
          ),
        }))}
      />
    </Card>
  );
}
