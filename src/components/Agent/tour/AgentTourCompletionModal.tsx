"use client";

import { Button, Modal, Typography } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";

type AgentTourCompletionModalProps = {
  open: boolean;
  tourCampaignId: string | null;
  onStartWorking: () => void;
  onRestart: () => void;
};

export function AgentTourCompletionModal({
  open,
  tourCampaignId,
  onStartWorking,
  onRestart,
}: AgentTourCompletionModalProps) {
  const router = useRouter();

  return (
    <Modal
      className="agent-tour-complete"
      open={open}
      title={null}
      footer={null}
      closable={false}
      centered
      width={500}
      destroyOnClose
    >
      <div className="agent-tour-complete__icon" aria-hidden>
        <CheckCircleOutlined />
      </div>
      <Typography.Title level={3} style={{ margin: 0, marginBottom: 8 }}>
        Tour completed
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 14 }}>
        You&apos;re ready to work. Choose what to do next:
      </Typography.Paragraph>
      <ul className="agent-tour-complete__list">
        <li>Create Lead — open a campaign and add a new lead</li>
        <li>Bulk Upload Leads — use Excel/CSV import</li>
        <li>View Campaign — review campaign details and leads</li>
      </ul>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 24,
        }}
      >
        <Button
          type="primary"
          block
          onClick={() => {
            if (tourCampaignId) {
              router.push(`/agent/campaigns/${tourCampaignId}`);
            } else {
              router.push("/agent/campaigns");
            }
            onStartWorking();
          }}
        >
          Start Working
        </Button>
        <Button block onClick={onRestart}>
          Restart Tour
        </Button>
      </div>
    </Modal>
  );
}
