"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  Popconfirm,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ClockCircleOutlined,
  GlobalOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const { Text } = Typography;

type NetworkRow = {
  id: string;
  label: string;
  cidr: string;
  is_active: boolean;
  created_at: string;
};

type SettingsResponse = {
  policy: {
    agent_ip_restriction_enabled: boolean;
    monitor_only: boolean;
    emergency_override_until: string | null;
  };
  networks: NetworkRow[];
  blocked_24h: number;
  error?: string;
};

const QUERY_KEY = ["admin", "network-settings"];

function overrideRemaining(until: string | null): string | null {
  if (!until) return null;
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default function AdminNetworkAccessCard() {
  const queryClient = useQueryClient();
  const [addForm] = Form.useForm<{ label: string; cidr: string }>();
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<SettingsResponse> => {
      const res = await fetch("/api/admin/network/settings", { credentials: "include" });
      const json = (await res.json()) as SettingsResponse;
      if (!res.ok) throw new Error(json.error ?? "Failed to load network settings");
      return json;
    },
    refetchInterval: 60_000,
  });

  const whoami = useQuery({
    queryKey: ["network", "whoami"],
    queryFn: async () => {
      const res = await fetch("/api/network/whoami", { credentials: "include" });
      const json = (await res.json()) as { client_ip?: string | null };
      return json.client_ip ?? null;
    },
    staleTime: 5 * 60_000,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const patchPolicy = async (body: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/network/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        message.error(json.error ?? "Update failed");
        return;
      }
      message.success(okMsg);
      refresh();
    } catch {
      message.error("Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    let values: { label: string; cidr: string };
    try {
      values = await addForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/network/office-ips", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        message.error(json.error ?? "Failed to add network");
        return;
      }
      message.success("Office network added");
      addForm.resetFields();
      refresh();
    } catch {
      message.error("Failed to add network");
    } finally {
      setSaving(false);
    }
  };

  const toggleNetwork = async (row: NetworkRow) => {
    const res = await fetch(`/api/admin/network/office-ips/${row.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      message.error(json.error ?? "Toggle failed");
      return;
    }
    message.success(row.is_active ? "Network deactivated" : "Network activated");
    refresh();
  };

  const policy = data?.policy;
  const remaining = overrideRemaining(policy?.emergency_override_until ?? null);

  return (
    <Card
      title={
        <Space>
          <GlobalOutlined />
          <Text strong style={{ fontSize: 16 }}>
            Network Access — Agent Restriction
          </Text>
        </Space>
      }
      loading={isLoading}
      style={{ borderRadius: 12 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {remaining ? (
          <Alert
            type="warning"
            showIcon
            icon={<ThunderboltOutlined />}
            message={`Emergency override active — agents may work from any network for the next ${remaining}`}
            action={
              <Popconfirm
                title="End the override now?"
                onConfirm={() => void patchPolicy({ override_hours: null }, "Override ended")}
              >
                <Button size="small" danger>
                  End now
                </Button>
              </Popconfirm>
            }
          />
        ) : null}

        <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
              Agent IP restriction
            </Text>
            <Switch
              checked={policy?.agent_ip_restriction_enabled ?? false}
              loading={saving}
              onChange={(checked) =>
                void patchPolicy(
                  { agent_ip_restriction_enabled: checked },
                  checked ? "Restriction enabled" : "Restriction disabled"
                )
              }
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
              Monitor-only (log, don&apos;t block)
            </Text>
            <Switch
              checked={policy?.monitor_only ?? true}
              loading={saving}
              onChange={(checked) =>
                void patchPolicy(
                  { monitor_only: checked },
                  checked ? "Monitor-only ON — nothing is blocked" : "Enforcement LIVE"
                )
              }
            />
          </div>
          <Statistic
            title="Blocked attempts (24h)"
            value={data?.blocked_24h ?? 0}
            valueStyle={{
              fontSize: 22,
              color: (data?.blocked_24h ?? 0) > 10 ? "#dc2626" : undefined,
            }}
          />
          {!remaining ? (
            <Dropdown
              menu={{
                items: [4, 8, 24].map((h) => ({
                  key: String(h),
                  label: `Allow any network for ${h}h`,
                })),
                onClick: ({ key }) =>
                  void patchPolicy(
                    { override_hours: Number(key) },
                    `Emergency override active for ${key}h`
                  ),
              }}
            >
              <Button icon={<ThunderboltOutlined />}>Emergency override</Button>
            </Dropdown>
          ) : null}
        </div>

        {policy?.agent_ip_restriction_enabled && policy.monitor_only ? (
          <Alert
            type="info"
            showIcon
            message="Monitor-only mode: would-be blocks are logged as auth events but agents are NOT blocked. Watch the blocked count for a few days, then turn monitor-only off to enforce."
          />
        ) : null}

        <div>
          <Text strong>Office networks</Text>
          {whoami.data ? (
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
              <ClockCircleOutlined /> Your current IP: <Text code>{whoami.data}</Text>
            </Text>
          ) : null}
          <Table<NetworkRow>
            size="small"
            style={{ marginTop: 8 }}
            rowKey="id"
            dataSource={data?.networks ?? []}
            pagination={false}
            columns={[
              { title: "Label", dataIndex: "label" },
              {
                title: "IP / CIDR",
                dataIndex: "cidr",
                render: (v: string) => <Text code>{v}</Text>,
              },
              {
                title: "Status",
                dataIndex: "is_active",
                width: 110,
                render: (v: boolean) =>
                  v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>,
              },
              {
                title: "",
                width: 120,
                render: (_, row) => (
                  <Popconfirm
                    title={row.is_active ? "Deactivate this network?" : "Activate this network?"}
                    description={
                      row.is_active
                        ? "Agents on this network will be blocked (when enforcement is on)."
                        : undefined
                    }
                    onConfirm={() => void toggleNetwork(row)}
                  >
                    <Button size="small">{row.is_active ? "Deactivate" : "Activate"}</Button>
                  </Popconfirm>
                ),
              },
            ]}
          />
          <Form
            form={addForm}
            layout="inline"
            style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}
            onFinish={() => void handleAdd()}
          >
            <Form.Item
              name="label"
              rules={[{ required: true, whitespace: true, message: "Label required" }]}
            >
              <Input placeholder='Label (e.g. "HQ Mumbai")' style={{ width: 200 }} />
            </Form.Item>
            <Form.Item
              name="cidr"
              rules={[{ required: true, whitespace: true, message: "IP/CIDR required" }]}
            >
              <Input placeholder="203.0.113.7 or 203.0.113.0/24" style={{ width: 220 }} />
            </Form.Item>
            <Button type="primary" icon={<PlusOutlined />} htmlType="submit" loading={saving}>
              Add network
            </Button>
          </Form>
        </div>
      </div>
    </Card>
  );
}
