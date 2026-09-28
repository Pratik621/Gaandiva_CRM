"use client";

import { Button, Checkbox, Modal, Typography } from "antd";
import { CompassOutlined } from "@ant-design/icons";

type AgentTourWelcomeModalProps = {
  open: boolean;
  dontShowAgain: boolean;
  onDontShowAgainChange: (checked: boolean) => void;
  onStart: () => void;
  onSkip: () => void;
};

export function AgentTourWelcomeModal({
  open,
  dontShowAgain,
  onDontShowAgainChange,
  onStart,
  onSkip,
}: AgentTourWelcomeModalProps) {
  return (
    <Modal
      className="agent-tour-welcome"
      open={open}
      title={null}
      footer={null}
      closable={false}
      centered
      width={480}
      destroyOnClose
    >
      <div className="agent-tour-welcome__icon" aria-hidden>
        <CompassOutlined />
      </div>
      <Typography.Title level={3} style={{ margin: 0, marginBottom: 8 }}>
        Welcome Tour
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 14 }}>
        A quick guided walkthrough from campaign selection to lead submission and bulk upload.
      </Typography.Paragraph>
      <ul className="agent-tour-welcome__list">
        <li>Open assigned campaigns</li>
        <li>Add a lead with required fields</li>
        <li>Generate the Meeting Report PDF</li>
        <li>Save leads or upload in bulk</li>
      </ul>
      <div style={{ marginTop: 20 }}>
        <Checkbox checked={dontShowAgain} onChange={(e) => onDontShowAgainChange(e.target.checked)}>
          Don&apos;t show again
        </Checkbox>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          marginTop: 24,
          flexWrap: "wrap",
        }}
      >
        <Button onClick={onSkip}>Skip Tour</Button>
        <Button type="primary" onClick={onStart}>
          Start Tour
        </Button>
      </div>
    </Modal>
  );
}
