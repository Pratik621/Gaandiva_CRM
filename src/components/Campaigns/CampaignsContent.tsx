"use client";

import { Card, Table, Button, Tag, Typography, Row, Col, Statistic } from "antd";
import { PlusOutlined, SendOutlined, MailOutlined, CheckCircleOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

const { Text } = Typography;

interface CampaignType {
  key: string;
  name: string;
  type: string;
  status: string;
  recipients: number;
  openRate: string;
  sentDate: string;
}

const campaignData: CampaignType[] = [
  { key: "1", name: "Q1 Product Launch", type: "Email", status: "Completed", recipients: 1250, openRate: "42%", sentDate: "Feb 15, 2025" },
  { key: "2", name: "Newsletter - February", type: "Email", status: "Scheduled", recipients: 2840, openRate: "-", sentDate: "Feb 20, 2025" },
  { key: "3", name: "Webinar Invitation", type: "Email", status: "Draft", recipients: 560, openRate: "-", sentDate: "-" },
  { key: "4", name: "Re-engagement Campaign", type: "Email", status: "Active", recipients: 890, openRate: "28%", sentDate: "Feb 18, 2025" },
];

export default function CampaignsContent() {
  const columns: ColumnsType<CampaignType> = [
    {
      title: "Campaign Name",
      dataIndex: "name",
      key: "name",
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        const colors: Record<string, string> = {
          Completed: "green",
          Scheduled: "blue",
          Draft: "default",
          Active: "cyan",
        };
        return <Tag color={colors[status] || "default"}>{status}</Tag>;
      },
    },
    {
      title: "Recipients",
      dataIndex: "recipients",
      key: "recipients",
    },
    {
      title: "Open Rate",
      dataIndex: "openRate",
      key: "openRate",
    },
    {
      title: "Sent Date",
      dataIndex: "sentDate",
      key: "sentDate",
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Campaigns</h1>
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
              Create and manage your marketing campaigns.
            </p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} size="large">
            New Campaign
          </Button>
        </div>
      </div>

      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Total Campaigns"
              value={12}
              prefix={<SendOutlined style={{ color: "#4f46e5" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Active"
              value={3}
              prefix={<MailOutlined style={{ color: "#52c41a" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Completed"
              value={8}
              prefix={<CheckCircleOutlined style={{ color: "#722ed1" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Avg. Open Rate"
              value="36%"
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={<Text strong style={{ fontSize: 16 }}>All Campaigns</Text>}
        bordered={false}
        style={{ borderRadius: 12 }}
      >
        <Table
          className="table-single-line"
          columns={columns}
          dataSource={campaignData}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          size="middle"
        />
      </Card>
    </>
  );
}
