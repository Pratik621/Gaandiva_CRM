"use client";

import { Card, Typography, Button, Result } from "antd";
import { ArrowLeftOutlined, LockOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import CampaignForm from "@/components/command/CampaignForm";

const { Title, Text } = Typography;

export default function CreateCampaignPage() {
  const router = useRouter();
  const { hasRole } = useAuth();

  const canCreate =
    hasRole("internal_operator") ||
    hasRole("internal_admin") ||
    hasRole("admin") ||
    hasRole("client_viewer");

  if (!canCreate) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
        <Result
          icon={<LockOutlined style={{ color: "#f59e0b" }} />}
          title="Access Restricted"
          subTitle="You need client_viewer, internal_operator, internal_admin, or admin to create campaigns."
          extra={
            <Button
              type="primary"
              onClick={() => router.push("/dashboard/campaigns")}
            >
              Back to Campaigns
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => router.push("/dashboard/campaigns")}
          style={{ paddingLeft: 0, marginBottom: 8 }}
        >
          Back to Campaigns
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          Create New Campaign
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Set up a new campaign with targeting, budget, and compliance settings
        </Text>
      </div>

      <Card
        bordered
        style={{
          borderRadius: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          maxWidth: 900,
        }}
      >
        <CampaignForm
          onSuccess={(campaign) => {
            const c = campaign as { id?: string };
            if (c.id) {
              router.push(`/dashboard/campaigns/${c.id}`);
            } else {
              router.push("/dashboard/campaigns");
            }
          }}
          onCancel={() => router.push("/dashboard/campaigns")}
        />
      </Card>
    </div>
  );
}
