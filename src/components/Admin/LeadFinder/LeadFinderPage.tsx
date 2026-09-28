"use client";

import { useState } from "react";
import { Card, Tabs, Typography } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import FilterForm from "@/components/Admin/LeadFinder/FilterForm";
import RunStatusCard from "@/components/Admin/LeadFinder/RunStatusCard";
import RunHistoryTable from "@/components/Admin/LeadFinder/RunHistoryTable";
import LeadsTable from "@/components/Admin/LeadFinder/LeadsTable";

const { Title, Text } = Typography;

export default function LeadFinderPage() {
  const [activeTab, setActiveTab] = useState("search");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [leadsBatch, setLeadsBatch] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div style={{ padding: "0 4px" }}>
      <div
        style={{
          marginBottom: 16,
          padding: "18px 22px",
          borderRadius: 14,
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #a855f7 100%)",
          color: "#fff",
        }}
      >
        <Title level={4} style={{ margin: 0, color: "#fff" }}>
          <RobotOutlined style={{ marginRight: 10 }} />
          Lead Finder AI
        </Title>
        <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
          Your AI agent for B2B prospecting — describe the ideal customer, launch, and watch
          verified leads flow into the CRM
        </Text>
      </div>

      <Card style={{ borderRadius: 12 }} styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "search",
              label: "New Search",
              children: (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {activeRunId ? (
                    <RunStatusCard
                      runId={activeRunId}
                      onFinished={() => setRefreshToken((t) => t + 1)}
                    />
                  ) : null}
                  <FilterForm
                    onStarted={(runId) => {
                      setActiveRunId(runId);
                      setRefreshToken((t) => t + 1);
                    }}
                  />
                </div>
              ),
            },
            {
              key: "history",
              label: "Run History",
              children: (
                <RunHistoryTable
                  refreshToken={refreshToken}
                  onSelectRun={(runId) => {
                    setActiveRunId(runId);
                    setActiveTab("search");
                  }}
                  onViewLeads={(batchName) => {
                    setLeadsBatch(batchName);
                    setActiveTab("leads");
                  }}
                />
              ),
            },
            {
              key: "leads",
              label: "Leads",
              children: <LeadsTable initialBatch={leadsBatch} />,
            },
          ]}
        />
      </Card>
    </div>
  );
}
