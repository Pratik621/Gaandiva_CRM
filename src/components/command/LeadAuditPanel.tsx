"use client";

import { useEffect, useState } from "react";
import {
  Drawer,
  Tag,
  Timeline,
  Divider,
  Button,
  Select,
  Input,
  message,
  Descriptions,
  Badge,
  Space,
  Skeleton,
  Alert,
  Modal,
  Typography,
} from "antd";
import {
  FileTextOutlined,
  HistoryOutlined,
  SafetyOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { useAuthReady } from "@/hooks/useAuthReady";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";

const { Text } = Typography;

interface Lead {
  id: string;
  name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: string;
  consent_status: string | null;
  channel: string | null;
  risk_flags: unknown;
  campaign_id: string;
  campaigns?: { name: string; campaign_id: string };
}

interface HistoryEntry {
  id: string;
  change_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  changed_by: string | null;
}

interface LeadAuditPanelProps {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

const CONSENT_COLORS: Record<string, string> = {
  verified: "green",
  missing: "red",
  pending: "orange",
  disputed: "purple",
};

const LEAD_STATUSES = [
  "new", "contacted", "qualified", "callback", "interested",
  "registered", "disqualified", "not_interested",
];

export default function LeadAuditPanel({
  leadId,
  open,
  onClose,
  onLeadUpdated,
}: LeadAuditPanelProps) {
  const { hasRole, authVersion } = useAuth();
  const authReady = useAuthReady();
  const [lead, setLead] = useState<Lead | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");
  const [isDqOverride, setIsDqOverride] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const canEdit =
    hasRole("internal_operator") ||
    hasRole("internal_admin") ||
    hasRole("admin");

  const canDqOverride = hasRole("internal_admin") || hasRole("admin");

  useEffect(() => {
    if (!open || !leadId || !authReady) return;

    setLoading(true);
    Promise.all([
      fetchWithAuthRetry(`/api/command/leads/${leadId}`).then((r) => r.json()) as Promise<{ lead: Lead }>,
      fetchWithAuthRetry(`/api/command/leads/${leadId}/history`).then((r) => r.json()) as Promise<{ history: HistoryEntry[] }>,
    ])
      .then(([leadData, histData]) => {
        setLead(leadData.lead);
        setHistory(histData.history ?? []);
      })
      .catch(() => message.error("Failed to load lead data"))
      .finally(() => setLoading(false));
    // `authVersion` refetches after cross-tab token rotation / tab return.
  }, [leadId, open, authReady, authVersion]);

  const handleStatusChange = async () => {
    if (!leadId || !newStatus) return;
    setStatusLoading(true);
    try {
      const res = await fetchWithAuthRetry(`/api/command/leads/${leadId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          reason,
          dq_override: isDqOverride,
        }),
      });

      const data = await res.json() as { error?: string; alertsCreated?: string[] };

      if (!res.ok) {
        message.error(data.error ?? "Status change failed");
        return;
      }

      message.success(`Status updated to ${newStatus}`);
      if (data.alertsCreated && data.alertsCreated.length > 0) {
        message.warning(`${data.alertsCreated.length} alert(s) created`);
      }

      setStatusModal(false);
      setNewStatus("");
      setReason("");
      setIsDqOverride(false);
      onLeadUpdated?.();

      // Refresh panel data
      const [updatedLead, updatedHistory] = await Promise.all([
        fetchWithAuthRetry(`/api/command/leads/${leadId}`).then((r) => r.json()) as Promise<{ lead: Lead }>,
        fetchWithAuthRetry(`/api/command/leads/${leadId}/history`).then((r) => r.json()) as Promise<{ history: HistoryEntry[] }>,
      ]);
      setLead(updatedLead.lead);
      setHistory(updatedHistory.history ?? []);
    } catch {
      message.error("Network error");
    } finally {
      setStatusLoading(false);
    }
  };

  const openConsentPdf = () => {
    if (leadId) {
      window.open(`/api/command/leads/${leadId}/consent-pdf`, "_blank");
    }
  };

  const riskFlags = (lead?.risk_flags as unknown[]) ?? [];

  return (
    <>
      <Drawer
        placement="right"
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SafetyOutlined style={{ color: "#4f46e5" }} />
            <span style={{ fontWeight: 700 }}>Lead Audit Panel</span>
            {lead && (
              <Tag color={CONSENT_COLORS[lead.consent_status ?? "pending"] ?? "default"}>
                {(lead.consent_status ?? "pending").toUpperCase()}
              </Tag>
            )}
          </div>
        }
        open={open}
        onClose={onClose}
        width={520}
        extra={
          <Space>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={openConsentPdf}
            >
              Consent PDF
            </Button>
            {canEdit && (
              <Button
                size="small"
                type="primary"
                icon={<EditOutlined />}
                onClick={() => setStatusModal(true)}
              >
                Change Status
              </Button>
            )}
          </Space>
        }
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : !lead ? (
          <Alert message="Lead not found" type="error" />
        ) : (
          <>
            {riskFlags.length > 0 && (
              <Alert
                message={`${riskFlags.length} Risk Flag(s) Active`}
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Descriptions
              title="Lead Info"
              column={1}
              size="small"
              bordered
              style={{ marginBottom: 20 }}
            >
              <Descriptions.Item label="Name">{lead.name ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Company">{lead.company_name ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Email">{lead.email ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Phone">{lead.phone ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="City">{lead.city ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Campaign">
                {lead.campaigns?.name ?? lead.campaign_id}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Badge
                  status={
                    lead.status === "registered"
                      ? "success"
                      : lead.status === "disqualified"
                      ? "error"
                      : "processing"
                  }
                  text={lead.status}
                />
              </Descriptions.Item>
              <Descriptions.Item label="Channel">
                <Tag>{lead.channel ?? "email"}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Consent">
                <Tag color={CONSENT_COLORS[lead.consent_status ?? "pending"] ?? "default"}>
                  {lead.consent_status ?? "pending"}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {canDqOverride && lead.status === "disqualified" && (
              <Alert
                message="DQ Override Available"
                description="As internal_admin, you can override the disqualification."
                type="info"
                showIcon
                action={
                  <Button
                    size="small"
                    onClick={() => {
                      setIsDqOverride(true);
                      setStatusModal(true);
                    }}
                  >
                    Override DQ
                  </Button>
                }
                style={{ marginBottom: 16 }}
              />
            )}

            <Divider orientation="left">
              <HistoryOutlined style={{ marginRight: 6 }} />
              History Timeline
            </Divider>

            {history.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                No history records yet.
              </Text>
            ) : (
              <Timeline
                mode="left"
                items={history.map((h) => ({
                  key: h.id,
                  label: (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(h.created_at).toLocaleString()}
                    </Text>
                  ),
                  children: (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>
                        {h.change_type.replace(/_/g, " ")}
                      </div>
                      {h.old_value && h.new_value && (
                        <div style={{ fontSize: 12, color: "#4b5563", marginTop: 2 }}>
                          {JSON.stringify(h.old_value)} → {JSON.stringify(h.new_value)}
                        </div>
                      )}
                      {h.reason && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                          Reason: {h.reason}
                        </div>
                      )}
                    </div>
                  ),
                }))}
              />
            )}
          </>
        )}
      </Drawer>

      <Modal
        title={isDqOverride ? "Override DQ Status" : "Change Lead Status"}
        open={statusModal}
        onCancel={() => {
          setStatusModal(false);
          setNewStatus("");
          setReason("");
          setIsDqOverride(false);
        }}
        onOk={handleStatusChange}
        okButtonProps={{ loading: statusLoading, disabled: !newStatus }}
        okText="Apply Change"
        width={460}
      >
        {isDqOverride && (
          <Alert
            message="Admin Override"
            description="This action will be logged and an alert will be created."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
            New Status *
          </label>
          <Select
            style={{ width: "100%" }}
            value={newStatus || undefined}
            onChange={setNewStatus}
            placeholder="Select target status"
          >
            {LEAD_STATUSES.map((s) => (
              <Select.Option key={s} value={s}>
                {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </Select.Option>
            ))}
          </Select>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
            {isDqOverride ? "Override Reason (required)" : "Reason (optional)"}
          </label>
          <Input.TextArea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isDqOverride
                ? "Mandatory: explain why DQ is being overridden…"
                : "Explain why the status is changing…"
            }
          />
        </div>
      </Modal>
    </>
  );
}
