"use client";

import { Card, Table, Tag, Typography, Progress } from "antd";
import type { ColumnsType } from "antd/es/table";

const { Text } = Typography;

interface DealType {
  key: string;
  company: string;
  contact: string;
  value: string;
  stage: string;
  probability: number;
}

const data: DealType[] = [
  { key: "1", company: "Acme Corp", contact: "Sarah Johnson", value: "$24,500", stage: "Proposal", probability: 75 },
  { key: "2", company: "TechStart Inc", contact: "Mike Chen", value: "$18,200", stage: "Negotiation", probability: 60 },
  { key: "3", company: "Global Solutions", contact: "Emma Wilson", value: "$42,000", stage: "Closed Won", probability: 100 },
  { key: "4", company: "Innovate Labs", contact: "James Brown", value: "$15,800", stage: "Qualification", probability: 40 },
  { key: "5", company: "DataFlow Systems", contact: "Lisa Anderson", value: "$31,200", stage: "Proposal", probability: 70 },
];

const stageColors: Record<string, string> = {
  "Qualification": "blue",
  "Proposal": "cyan",
  "Negotiation": "orange",
  "Closed Won": "green",
  "Closed Lost": "red",
};

export default function DealsTable() {
  const columns: ColumnsType<DealType> = [
    {
      title: "Company",
      dataIndex: "company",
      key: "company",
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: "Contact",
      dataIndex: "contact",
      key: "contact",
    },
    {
      title: "Value",
      dataIndex: "value",
      key: "value",
      render: (text) => <Text style={{ color: "#52c41a", fontWeight: 600 }}>{text}</Text>,
    },
    {
      title: "Stage",
      dataIndex: "stage",
      key: "stage",
      render: (stage) => <Tag color={stageColors[stage] || "default"}>{stage}</Tag>,
    },
    {
      title: "Probability",
      dataIndex: "probability",
      key: "probability",
      render: (prob) => (
        <Progress
          percent={prob}
          size="small"
          strokeColor={prob >= 70 ? "#52c41a" : prob >= 40 ? "#f59e0b" : "#ef4444"}
        />
      ),
    },
  ];

  return (
    <Card
      title={<Text strong style={{ fontSize: 16 }}>Recent Deals</Text>}
      bordered={false}
      style={{
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <Table
        className="table-single-line"
        columns={columns}
        dataSource={data}
        pagination={{ pageSize: 5, showSizeChanger: false }}
        size="middle"
      />
    </Card>
  );
}
