"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Table,
  Tag,
  Button,
  Modal,
  message,
  Badge,
  Space,
  Tooltip,
  Select,
  Form,
  Input,
  Collapse,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { CheckCircleOutlined, ReloadOutlined, EyeOutlined } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { useAuthReady } from "@/hooks/useAuthReady";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";
import {
  ALERT_CATEGORY_DEFINITIONS,
  getAlertCategoryLabel,
  RESOLUTION_CATEGORY_OPTIONS,
  severityToTier,
  tierLabel,
  tierTagColor,
} from "@/lib/command/alert-categories";
import type { AlertListStatusFilter } from "@/lib/command/db";

const { Text, Paragraph } = Typography;

interface AlertItem {
  id: string;
  display_id?: number;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolution_note: string | null;
  resolution_category?: string | null;
  acknowledged_at?: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  created_at: string;
  campaigns?: { name: string } | null;
  resolved_by_user?: { full_name: string | null; email: string | null } | null;
  acknowledged_by_user?: { full_name: string | null; email: string | null } | null;
}

const LIST_FILTERS: { value: AlertListStatusFilter; label: string }[] = [
  { value: "unresolved", label: "Unresolved" },
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

function alertWorkflowStatus(row: AlertItem): "Open" | "Acknowledged" | "Resolved" {
  if (row.is_resolved) return "Resolved";
  if (row.acknowledged_at) return "Acknowledged";
  return "Open";
}

function resolutionCategoryLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const o = RESOLUTION_CATEGORY_OPTIONS.find((x) => x.value === code);
  return o?.label ?? code.replace(/_/g, " ");
}

interface AlertsPanelProps {
  campaignId?: string;
  onOpenLeadAudit?: (leadId: string) => void;
}

export default function AlertsPanel({ campaignId, onOpenLeadAudit }: AlertsPanelProps) {
  const { hasRole, authVersion } = useAuth();
  const authReady = useAuthReady();
  const searchParams = useSearchParams();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolveModal, setResolveModal] = useState<string | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [listFilter, setListFilter] = useState<AlertListStatusFilter>("unresolved");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [form] = Form.useForm<{ resolution_note: string; resolution_category: string }>();

  const alertsFilterParam = (searchParams.get("alerts_filter") ?? "").toLowerCase();
  useEffect(() => {
    const allowed: AlertListStatusFilter[] = [
      "all",
      "unresolved",
      "open",
      "acknowledged",
      "resolved",
    ];
    if (allowed.includes(alertsFilterParam as AlertListStatusFilter)) {
      setListFilter(alertsFilterParam as AlertListStatusFilter);
    }
  }, [alertsFilterParam]);

  const canResolve =
    hasRole("internal_operator") || hasRole("internal_admin") || hasRole("admin");

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campaignId) params.set("campaign_id", campaignId);
      params.set("alert_status", listFilter);
      if (severityFilter) params.set("severity", severityFilter);

      const res = await fetchWithAuthRetry(`/api/command/alerts?${params.toString()}`);
      const data = (await res.json()) as { alerts?: AlertItem[] };
      setAlerts(data.alerts ?? []);
    } catch {
      message.error("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [campaignId, listFilter, severityFilter]);

  useEffect(() => {
    if (!authReady) return;
    void fetchAlerts();
    // `authVersion` refetches after cross-tab token rotation / tab return.
  }, [authReady, authVersion, fetchAlerts]);

  const handleResolve = async () => {
    if (!resolveModal) return;
    try {
      const values = await form.validateFields();
      setResolveLoading(true);
      const res = await fetchWithAuthRetry(`/api/command/alerts/${resolveModal}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution_note: values.resolution_note,
          resolution_category: values.resolution_category,
        }),
      });

      if (res.ok) {
        message.success("Alert resolved and logged to lead history");
        setResolveModal(null);
        form.resetFields();
        void fetchAlerts();
      } else {
        const d = (await res.json()) as { error?: string };
        message.error(d.error ?? "Failed to resolve alert");
      }
    } catch {
      /* validation */
    } finally {
      setResolveLoading(false);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      const res = await fetchWithAuthRetry(`/api/command/alerts/${alertId}/acknowledge`, {
        method: "POST",
      });
      if (res.ok) {
        message.success("Alert acknowledged");
        void fetchAlerts();
      } else {
        const d = (await res.json()) as { error?: string };
        message.error(d.error ?? "Failed to acknowledge");
      }
    } catch {
      message.error("Network error");
    }
  };

  const unresolvedCount = alerts.filter((a) => !a.is_resolved).length;
  const criticalCount = alerts.filter(
    (a) => !a.is_resolved && severityToTier(a.severity) === "critical"
  ).length;

  const columns: ColumnsType<AlertItem> = [
    {
      title: "Alert ID",
      key: "display_id",
      width: 88,
      render: (_, row) => (
        <Text strong style={{ fontFamily: "monospace", fontSize: 12 }}>
          #{row.display_id ?? "—"}
        </Text>
      ),
    },
    {
      title: "Timestamp",
      dataIndex: "created_at",
      width: 200,
      render: (ts: string) => (
        <div style={{ fontSize: 12, lineHeight: 1.45 }}>
          <div>{new Date(ts).toISOString().replace("T", " ").slice(0, 19)} UTC</div>
          <Text type="secondary">{new Date(ts).toLocaleString()}</Text>
        </div>
      ),
    },
    {
      title: "Severity",
      dataIndex: "severity",
      width: 100,
      render: (s: string) => {
        const tier = severityToTier(s);
        return (
          <Tag color={tierTagColor(tier)} style={{ fontWeight: 600 }}>
            {tierLabel(tier).toUpperCase()}
          </Tag>
        );
      },
    },
    {
      title: "Type",
      dataIndex: "alert_type",
      width: 160,
      ellipsis: true,
      render: (t: string) => (
        <Tooltip title={getAlertCategoryLabel(t)}>
          <span style={{ fontWeight: 500 }}>{getAlertCategoryLabel(t)}</span>
        </Tooltip>
      ),
    },
    {
      title: "Lead",
      key: "lead",
      width: 120,
      render: (_, row) =>
        row.lead_id ? (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            style={{ padding: 0, height: "auto" }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenLeadAudit?.(row.lead_id!);
            }}
          >
            {row.lead_id.slice(0, 8)}…
          </Button>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Description",
      key: "description",
      ellipsis: true,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{row.title}</div>
          {row.message ? (
            <div style={{ fontSize: 12, color: "#6b7280" }}>{row.message}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "Status",
      key: "workflow_status",
      width: 120,
      render: (_, row) => {
        const st = alertWorkflowStatus(row);
        const color =
          st === "Resolved" ? "success" : st === "Acknowledged" ? "processing" : "error";
        return <Tag color={color}>{st}</Tag>;
      },
    },
    {
      title: "Resolved by",
      key: "resolved_by",
      width: 140,
      ellipsis: true,
      render: (_, row) =>
        row.is_resolved ? (
          row.resolved_by_user?.full_name ||
          row.resolved_by_user?.email ||
          "—"
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Resolution",
      key: "resolution",
      width: 200,
      ellipsis: true,
      render: (_, row) =>
        row.is_resolved ? (
          <div style={{ fontSize: 12 }}>
            <div>
              <Text type="secondary">Category: </Text>
              {resolutionCategoryLabel(row.resolution_category)}
            </div>
            <Tooltip title={row.resolution_note ?? ""}>
              <div style={{ color: "#4b5563" }}>{row.resolution_note ?? "—"}</div>
            </Tooltip>
          </div>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 200,
      fixed: "right" as const,
      render: (_, row) => (
        <Space size={4} wrap>
          {!row.is_resolved && !row.acknowledged_at && canResolve && (
            <Button size="small" onClick={() => void handleAcknowledge(row.id)}>
              Acknowledge
            </Button>
          )}
          {!row.is_resolved && canResolve && (
            <Tooltip title="Resolve (requires notes & category)">
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  form.resetFields();
                  setResolveModal(row.id);
                }}
              >
                Resolve
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const categoryTableColumns: ColumnsType<(typeof ALERT_CATEGORY_DEFINITIONS)[number]> = [
    { title: "Alert type", dataIndex: "label", key: "label", width: 200 },
    {
      title: "Severity (UI)",
      key: "tier",
      width: 110,
      render: (_, r) => <Tag color={tierTagColor(r.tier)}>{tierLabel(r.tier)}</Tag>,
    },
    { title: "Trigger condition", dataIndex: "trigger", key: "trigger", ellipsis: true },
    { title: "Example", dataIndex: "example", key: "example", ellipsis: true },
  ];

  return (
    <div>
      <Collapse
        style={{ marginBottom: 16 }}
        items={[
          {
            key: "categories",
            label: (
              <Text strong>
                Alert categories (reference) — §5.5.1
              </Text>
            ),
            children: (
              <Table
                size="small"
                pagination={false}
                rowKey="typeKey"
                columns={categoryTableColumns}
                dataSource={ALERT_CATEGORY_DEFINITIONS}
                scroll={{ x: 900 }}
              />
            ),
          },
        ]}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Space>
          <Badge count={criticalCount} style={{ backgroundColor: "#ef4444" }}>
            <Tag color="red" style={{ fontSize: 13, padding: "4px 10px" }}>
              {unresolvedCount} unresolved
            </Tag>
          </Badge>
        </Space>

        <Space wrap>
          <Select
            value={listFilter}
            onChange={(v) => setListFilter(v)}
            size="small"
            style={{ width: 150 }}
            options={LIST_FILTERS.map((o) => ({ value: o.value, label: o.label }))}
          />

          <Select
            value={severityFilter || undefined}
            onChange={setSeverityFilter}
            size="small"
            style={{ width: 130 }}
            placeholder="DB severity"
            allowClear
          >
            {(["critical", "high", "medium", "low"] as const).map((s) => (
              <Select.Option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Select.Option>
            ))}
          </Select>

          <Button size="small" icon={<ReloadOutlined />} onClick={() => void fetchAlerts()}>
            Refresh
          </Button>
        </Space>
      </div>

      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        Newest first. Resolving an alert writes an immutable entry to Lead history for the linked
        lead (when present). Resolution cannot be undone from the UI.
      </Paragraph>

      <Table
        columns={columns}
        dataSource={alerts}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 15, showTotal: (t) => `${t} alerts` }}
        scroll={{ x: 1400 }}
        onRow={(row) => ({
          style:
            !row.is_resolved && severityToTier(row.severity) === "critical"
              ? { background: "#fff2f0" }
              : undefined,
        })}
      />

      <Modal
        title="Resolve alert"
        open={Boolean(resolveModal)}
        onCancel={() => {
          setResolveModal(null);
          form.resetFields();
        }}
        onOk={() => void handleResolve()}
        okButtonProps={{ loading: resolveLoading }}
        okText="Submit resolution"
        width={520}
        destroyOnClose
      >
        <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
          Resolution notes are mandatory (minimum 20 characters). Choose a resolution category.
          This action is logged on the lead and cannot be undone here.
        </Paragraph>
        <Form form={form} layout="vertical" requiredMark>
          <Form.Item
            name="resolution_category"
            label="Resolution category"
            rules={[{ required: true, message: "Select a category" }]}
          >
            <Select
              placeholder="Select category"
              options={RESOLUTION_CATEGORY_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="resolution_note"
            label="Resolution notes"
            rules={[
              { required: true, message: "Enter resolution notes" },
              { min: 20, message: "At least 20 characters required" },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder="Describe the resolution (min. 20 characters)…"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
