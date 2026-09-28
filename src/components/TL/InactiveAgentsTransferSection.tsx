"use client";

import React, { useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { SwapOutlined, WarningOutlined } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { useCachedApiQuery } from "@/hooks/useCachedApiQuery";
import { getTeamMemberLabel, type TeamMember } from "@/lib/tl/team-hierarchy";
import { isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import LeadTransferModal from "@/components/TL/LeadTransferModal";

const { Text } = Typography;

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid #f0f0f0",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

type EligibleAgent = TeamMember & { lead_count: number };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function InactiveAgentRow({
  agent,
  onTransfer,
}: {
  agent: EligibleAgent;
  onTransfer: (agentId: string) => void;
}) {
  const label = getTeamMemberLabel(agent);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 12px",
        background: "#fff7e6",
        borderRadius: 10,
        border: "1px solid #ffe7ba",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Avatar size={32} style={{ background: "#faad14", flexShrink: 0 }}>
          {initials(label)}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <Text strong style={{ fontSize: 13, display: "block" }} ellipsis>
            {label}
          </Text>
          <Space size={4}>
            <Tag style={{ margin: 0, fontSize: 10 }}>inactive</Tag>
            <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>
              {agent.lead_count} lead{agent.lead_count === 1 ? "" : "s"}
            </Tag>
          </Space>
        </div>
      </div>
      <Button
        type="primary"
        size="small"
        icon={<SwapOutlined />}
        onClick={() => onTransfer(agent.id)}
      >
        Transfer Leads
      </Button>
    </div>
  );
}

export default function InactiveAgentsTransferSection() {
  const { roles, isInitialized } = useAuth();
  const isCampaignTl = roles.some((r) =>
    isCampaignTeamLeaderRole(r.role_name ?? r.name)
  );
  const [transferAgentId, setTransferAgentId] = useState<string | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  const { data, isLoading, refetch } = useCachedApiQuery<{ agents: EligibleAgent[] }>(
    ["tl", "lead-transfer", "eligible-agents"],
    "/api/tl/leads/transfer/eligible-agents",
    { enabled: isInitialized && isCampaignTl }
  );

  if (!isInitialized || !isCampaignTl) {
    return null;
  }

  const agents = data?.agents ?? [];

  return (
    <>
      <Card
        style={{ ...cardStyle, borderColor: "#ffe7ba", marginBottom: 24 }}
        title={
          <Space>
            <WarningOutlined style={{ color: "#faad14" }} />
            <span>Inactive agents with leads</span>
            {!isLoading && <Tag color="orange">{agents.length}</Tag>}
          </Space>
        }
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          Transfer leads from inactive agents to active agents on your team.
        </Text>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <Spin />
          </div>
        ) : agents.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No inactive agents with leads on your team"
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 10,
            }}
          >
            {agents.map((agent) => (
              <InactiveAgentRow
                key={agent.id}
                agent={agent}
                onTransfer={(id) => {
                  setTransferAgentId(id);
                  setTransferModalOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </Card>

      <LeadTransferModal
        open={transferModalOpen}
        fromAgentId={transferAgentId}
        onClose={() => {
          setTransferModalOpen(false);
          setTransferAgentId(null);
        }}
        onSuccess={() => {
          void refetch();
        }}
      />
    </>
  );
}
