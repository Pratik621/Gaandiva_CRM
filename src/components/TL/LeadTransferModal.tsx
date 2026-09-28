"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Descriptions,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Spin,
  Table,
  Typography,
  message,
} from "antd";
import { SwapOutlined } from "@ant-design/icons";
import type { TransferMode } from "@/lib/tl/lead-transfer";

type AgentInfo = {
  id: string;
  full_name: string | null;
  email: string | null;
  agent_code: string | null;
  status: string;
};

type CampaignOption = {
  campaign_id: string;
  campaign_name: string;
  lead_count: number;
};

type LeadOption = {
  id: string;
  lead_id: string | null;
  name: string | null;
  company_name: string | null;
  campaign_name?: string;
};

type PreviewData = {
  from_agent: AgentInfo;
  active_agents: AgentInfo[];
  total_leads: number;
  campaigns: CampaignOption[];
};

function agentLabel(agent: AgentInfo): string {
  const name = agent.full_name?.trim() || agent.email?.trim() || "Unknown";
  const code = agent.agent_code?.trim();
  return code ? `${name} (${code})` : name;
}

export type LeadTransferModalProps = {
  open: boolean;
  fromAgentId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function LeadTransferModal({
  open,
  fromAgentId,
  onClose,
  onSuccess,
}: LeadTransferModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [availableLeads, setAvailableLeads] = useState<LeadOption[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const transferMode = Form.useWatch("transfer_mode", form) as TransferMode | undefined;
  const toAgentId = Form.useWatch("to_agent_id", form) as string | undefined;
  const campaignId = Form.useWatch("campaign_id", form) as string | undefined;

  const loadPreview = useCallback(async () => {
    if (!fromAgentId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/tl/leads/transfer/preview?from_agent_id=${encodeURIComponent(fromAgentId)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load transfer preview");
      setPreview(data as PreviewData);
      form.setFieldsValue({
        transfer_mode: "all",
        to_agent_id: undefined,
        campaign_id: undefined,
        notes: "",
      });
      setSelectedLeadIds([]);
      setAvailableLeads([]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load preview");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [fromAgentId, form, onClose]);

  useEffect(() => {
    if (open && fromAgentId) {
      void loadPreview();
    } else {
      setPreview(null);
      form.resetFields();
      setSelectedLeadIds([]);
      setAvailableLeads([]);
    }
  }, [open, fromAgentId, loadPreview, form]);

  useEffect(() => {
    if (!open || !fromAgentId || transferMode !== "selected") return;

    const loadLeads = async () => {
      setLeadsLoading(true);
      try {
        const params = new URLSearchParams({
          agent_ids: fromAgentId,
          export: "all",
        });

        const res = await fetch(`/api/tl/leads?${params.toString()}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load leads");

        let leads = (data.leads ?? []) as (LeadOption & { campaign_id?: string })[];
        if (campaignId) {
          leads = leads.filter((l) => l.campaign_id === campaignId);
        }
        setAvailableLeads(leads);
        setSelectedLeadIds((prev) => prev.filter((id) => leads.some((l) => l.id === id)));
      } catch (err) {
        message.error(err instanceof Error ? err.message : "Failed to load leads");
        setAvailableLeads([]);
      } finally {
        setLeadsLoading(false);
      }
    };

    void loadLeads();
  }, [open, fromAgentId, transferMode, campaignId]);

  const leadCount = useMemo(() => {
    if (!preview) return 0;
    if (transferMode === "all") return preview.total_leads;
    if (transferMode === "campaign" && campaignId) {
      return preview.campaigns.find((c) => c.campaign_id === campaignId)?.lead_count ?? 0;
    }
    if (transferMode === "selected") return selectedLeadIds.length;
    return 0;
  }, [preview, transferMode, campaignId, selectedLeadIds]);

  const selectedCampaignName = useMemo(() => {
    if (transferMode === "all") return "All Campaigns";
    if (transferMode === "campaign" && campaignId) {
      return preview?.campaigns.find((c) => c.campaign_id === campaignId)?.campaign_name ?? "—";
    }
    if (transferMode === "selected") {
      if (campaignId) {
        return preview?.campaigns.find((c) => c.campaign_id === campaignId)?.campaign_name ?? "Selected";
      }
      return "Selected Leads";
    }
    return "—";
  }, [transferMode, campaignId, preview]);

  const toAgent = preview?.active_agents.find((a) => a.id === toAgentId);

  const handleTransfer = async () => {
    try {
      const values = await form.validateFields();
      if (!fromAgentId) return;

      if (values.transfer_mode === "selected" && selectedLeadIds.length === 0) {
        message.warning("Select at least one lead to transfer");
        return;
      }
      if (leadCount === 0) {
        message.warning("No leads to transfer");
        return;
      }

      setSubmitting(true);
      const res = await fetch("/api/tl/leads/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          from_agent_id: fromAgentId,
          to_agent_id: values.to_agent_id,
          transfer_mode: values.transfer_mode,
          campaign_id: values.campaign_id,
          lead_ids: values.transfer_mode === "selected" ? selectedLeadIds : undefined,
          notes: values.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transfer failed");

      message.success(`${data.leads_transferred} lead(s) transferred successfully`);
      onSuccess?.();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <span>
          <SwapOutlined style={{ marginRight: 8, color: "#4f46e5" }} />
          Transfer Leads
        </span>
      }
      open={open}
      onCancel={onClose}
      onOk={handleTransfer}
      okText="Transfer"
      confirmLoading={submitting}
      okButtonProps={{ disabled: loading || leadCount === 0 }}
      width={640}
      destroyOnClose
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin tip="Loading transfer details..." />
        </div>
      ) : preview ? (
        <div style={{ marginTop: 8 }}>
          <Descriptions
            bordered
            size="small"
            column={1}
            style={{ marginBottom: 20 }}
            items={[
              {
                key: "from",
                label: "Inactive Agent",
                children: (
                  <Typography.Text strong>{agentLabel(preview.from_agent)}</Typography.Text>
                ),
              },
              {
                key: "leads",
                label: "Total Leads",
                children: preview.total_leads,
              },
            ]}
          />

          {preview.total_leads === 0 ? (
            <Alert
              type="info"
              showIcon
              message="This agent has no leads assigned."
              style={{ marginBottom: 16 }}
            />
          ) : preview.active_agents.length === 0 ? (
            <Alert
              type="warning"
              showIcon
              message="No active agents available under your team to receive leads."
            />
          ) : (
            <Form form={form} layout="vertical">
              <Form.Item
                name="to_agent_id"
                label="Transfer To"
                rules={[{ required: true, message: "Select an active agent" }]}
              >
                <Select
                  placeholder="Select active agent"
                  showSearch
                  optionFilterProp="label"
                  options={preview.active_agents.map((agent) => ({
                    value: agent.id,
                    label: agentLabel(agent),
                  }))}
                />
              </Form.Item>

              <Form.Item
                name="transfer_mode"
                label="Transfer Options"
                rules={[{ required: true }]}
              >
                <Radio.Group>
                  <Radio value="all">Transfer All Leads</Radio>
                  <Radio value="campaign">Transfer Selected Campaign Leads</Radio>
                  <Radio value="selected">Transfer Selected Leads</Radio>
                </Radio.Group>
              </Form.Item>

              {(transferMode === "campaign" || transferMode === "selected") && (
                <Form.Item
                  name="campaign_id"
                  label="Campaign"
                  rules={
                    transferMode === "campaign"
                      ? [{ required: true, message: "Select a campaign" }]
                      : []
                  }
                >
                  <Select
                    placeholder={
                      transferMode === "campaign"
                        ? "Select campaign"
                        : "Filter by campaign (optional)"
                    }
                    allowClear={transferMode === "selected"}
                    showSearch
                    optionFilterProp="label"
                    options={preview.campaigns.map((c) => ({
                      value: c.campaign_id,
                      label: `${c.campaign_name} (${c.lead_count})`,
                    }))}
                  />
                </Form.Item>
              )}

              {transferMode === "selected" && (
                <Form.Item label="Select Leads">
                  <Table
                    size="small"
                    rowKey="id"
                    loading={leadsLoading}
                    dataSource={availableLeads}
                    pagination={{ pageSize: 5, showSizeChanger: false }}
                    rowSelection={{
                      selectedRowKeys: selectedLeadIds,
                      onChange: (keys) => setSelectedLeadIds(keys as string[]),
                    }}
                    columns={[
                      {
                        title: "Lead ID",
                        dataIndex: "lead_id",
                        key: "lead_id",
                        render: (v: string | null) => v || "—",
                      },
                      {
                        title: "Name",
                        dataIndex: "name",
                        key: "name",
                        render: (v: string | null) => v || "—",
                      },
                      {
                        title: "Company",
                        dataIndex: "company_name",
                        key: "company_name",
                        render: (v: string | null) => v || "—",
                      },
                      {
                        title: "Campaign",
                        dataIndex: "campaign_name",
                        key: "campaign_name",
                        render: (v: string | null | undefined) => v || "—",
                      },
                    ]}
                    scroll={{ y: 200 }}
                  />
                </Form.Item>
              )}

              <Form.Item name="notes" label="Notes (optional)">
                <Input.TextArea rows={2} placeholder="Reason for transfer..." maxLength={2000} />
              </Form.Item>

              {toAgent && leadCount > 0 && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 4 }}
                  message={
                    <span>
                      Transfer <strong>{leadCount}</strong> lead(s) from{" "}
                      <strong>{agentLabel(preview.from_agent)}</strong> to{" "}
                      <strong>{agentLabel(toAgent)}</strong>
                      {transferMode !== "all" && (
                        <>
                          {" "}
                          — Campaign: <strong>{selectedCampaignName}</strong>
                        </>
                      )}
                    </span>
                  }
                />
              )}
            </Form>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
