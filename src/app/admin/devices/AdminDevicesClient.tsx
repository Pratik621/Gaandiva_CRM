"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  StopOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { AdminDeviceRolloutCard } from "@/components/Admin/AdminDeviceRolloutCard";

dayjs.extend(relativeTime);

type DeviceRow = {
  id: string;
  user_id: string;
  device_name: string;
  browser: string | null;
  os: string | null;
  location_approx: string | null;
  status: string;
  created_at: string;
  last_seen_at: string | null;
  user_name: string;
  user_email: string | null;
  user_roles: string[];
};

type ExistingDevice = {
  id: string;
  device_name: string;
  browser: string | null;
  os: string | null;
  location_approx: string | null;
  last_seen_at: string | null;
  created_at: string;
};

export default function AdminDevicesPage() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [limitModal, setLimitModal] = useState<{
    pendingId: string;
    existing: ExistingDevice[];
  } | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (roleFilter) params.set("role", roleFilter);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/devices?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as {
        devices?: DeviceRow[];
        pending_count?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setDevices(data.devices ?? []);
      setPendingCount(data.pending_count ?? 0);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, [q, roleFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (highlightId) {
      setStatusFilter(undefined);
    }
  }, [highlightId]);

  const approveOne = async (id: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/devices/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        existingDevices?: ExistingDevice[];
      };
      if (res.status === 409 && data.code === "DEVICE_LIMIT") {
        setLimitModal({ pendingId: id, existing: data.existingDevices ?? [] });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      message.success("Device approved");
      window.dispatchEvent(new CustomEvent("gandiv:device-request"));
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActing(false);
    }
  };

  const rejectOne = async (id: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/devices/${id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Reject failed");
      message.success("Device rejected");
      window.dispatchEvent(new CustomEvent("gandiv:device-request"));
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActing(false);
    }
  };

  const revokeOne = (id: string) => {
    Modal.confirm({
      title: "Revoke this device?",
      content: "The user will be blocked on that browser until they request access again.",
      okType: "danger",
      okText: "Revoke",
      onOk: async () => {
        setActing(true);
        try {
          const res = await fetch(`/api/admin/devices/${id}/revoke`, {
            method: "POST",
            credentials: "include",
          });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) throw new Error(data.error ?? "Revoke failed");
          message.success("Device revoked");
          await load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : "Revoke failed");
        } finally {
          setActing(false);
        }
      },
    });
  };

  const revokeAndApprove = async (revokeDeviceId: string) => {
    if (!limitModal) return;
    setActing(true);
    try {
      const res = await fetch(
        `/api/admin/devices/${limitModal.pendingId}/revoke-and-approve`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revokeDeviceId }),
        }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      message.success("Old device revoked and new device approved");
      setLimitModal(null);
      window.dispatchEvent(new CustomEvent("gandiv:device-request"));
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  };

  const bulkApprove = async () => {
    const pendingIds = selected.filter((id) =>
      devices.some((d) => d.id === id && d.status === "pending")
    );
    if (pendingIds.length === 0) {
      message.info("Select pending devices to approve");
      return;
    }
    setActing(true);
    let ok = 0;
    let limited = 0;
    for (const id of pendingIds) {
      const res = await fetch(`/api/admin/devices/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 409) {
        limited += 1;
        continue;
      }
      if (res.ok) ok += 1;
    }
    setActing(false);
    setSelected([]);
    message.success(`Approved ${ok}${limited ? `, ${limited} hit device limit` : ""}`);
    window.dispatchEvent(new CustomEvent("gandiv:device-request"));
    await load();
  };

  const columns: ColumnsType<DeviceRow> = useMemo(
    () => [
      {
        title: "User",
        key: "user",
        render: (_, row) => (
          <div>
            <div className="font-medium">{row.user_name}</div>
            <div className="text-xs text-slate-500">{row.user_email}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {row.user_roles.map((r) => (
                <Tag key={r} className="!m-0 !text-xs">
                  {r.replace(/_/g, " ")}
                </Tag>
              ))}
            </div>
          </div>
        ),
      },
      {
        title: "Device",
        key: "device",
        render: (_, row) => (
          <div>
            <div>{row.device_name}</div>
            <div className="text-xs text-slate-500">
              {[row.browser, row.os, row.location_approx].filter(Boolean).join(" · ")}
            </div>
          </div>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        width: 110,
        render: (status: string) => {
          const color =
            status === "pending" ? "gold" : status === "approved" ? "green" : "default";
          return <Tag color={color}>{status}</Tag>;
        },
      },
      {
        title: "Requested",
        dataIndex: "created_at",
        width: 140,
        render: (v: string) => (
          <span className="text-sm" title={dayjs(v).format("DD MMM YYYY HH:mm")}>
            {dayjs(v).fromNow()}
          </span>
        ),
      },
      {
        title: "Last active",
        dataIndex: "last_seen_at",
        width: 140,
        render: (v: string | null) =>
          v ? (
            <span className="text-sm">{dayjs(v).fromNow()}</span>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        title: "Actions",
        key: "actions",
        width: 220,
        render: (_, row) => (
          <Space size="small" wrap>
            {row.status === "pending" && (
              <>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={acting}
                  onClick={() => void approveOne(row.id)}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  loading={acting}
                  onClick={() => void rejectOne(row.id)}
                >
                  Reject
                </Button>
              </>
            )}
            {row.status === "approved" && (
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                loading={acting}
                onClick={() => revokeOne(row.id)}
              >
                Revoke
              </Button>
            )}
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acting]
  );

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Devices
            </Typography.Title>
            <Typography.Text type="secondary">
              Approve new browser access requests
              {pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
            </Typography.Text>
          </div>
          <Space wrap>
            <Button
              type="primary"
              disabled={selected.length === 0}
              loading={acting}
              onClick={() => void bulkApprove()}
            >
              Bulk approve selected
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
          </Space>
        </div>
        <div
          style={{
            marginTop: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
          }}
        >
          <Select
            allowClear
            placeholder="Status"
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "revoked", label: "Revoked" },
            ]}
          />
          <Select
            allowClear
            placeholder="Role"
            style={{ width: 160 }}
            value={roleFilter}
            onChange={(v) => setRoleFilter(v)}
            options={[
              { value: "admin", label: "Admin" },
              { value: "agent", label: "Agent" },
              { value: "team_leader", label: "Team leader" },
              { value: "sales", label: "Sales" },
              { value: "qa", label: "QA" },
              { value: "mis", label: "MIS" },
              { value: "mis_tl", label: "MIS TL" },
              { value: "qa_tl", label: "QA TL" },
              { value: "dc", label: "DC" },
            ]}
          />
          <Input.Search
            placeholder="Search user or device"
            allowClear
            style={{ maxWidth: 320, flex: 1, minWidth: 200 }}
            onSearch={(v) => setQ(v)}
          />
        </div>
      </div>

      <AdminDeviceRolloutCard />

      {pendingCount > 0 && (
        <Alert
          type="warning"
          showIcon
          className="!mb-4"
          message={`${pendingCount} device request${pendingCount === 1 ? "" : "s"} waiting for approval`}
        />
      )}

      <div
        className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden"
        style={{ minHeight: 200 }}
      >
        <Table
          className="table-single-line"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={devices}
          scroll={{ x: true }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} devices`,
          }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys as string[]),
            getCheckboxProps: (row) => ({ disabled: row.status !== "pending" }),
          }}
          rowClassName={(row) =>
            row.id === highlightId
              ? "bg-amber-50"
              : row.status === "pending"
                ? "bg-yellow-50/40"
                : ""
          }
          locale={{ emptyText: "No devices match these filters" }}
        />
      </div>

      <Modal
        title="Device limit reached"
        open={Boolean(limitModal)}
        onCancel={() => setLimitModal(null)}
        footer={null}
      >
        <Typography.Paragraph>
          This user already has 3 approved devices. Revoke one below to approve the new request.
        </Typography.Paragraph>
        <Space direction="vertical" className="w-full">
          {(limitModal?.existing ?? []).map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
            >
              <div>
                <div className="font-medium">{d.device_name}</div>
                <div className="text-xs text-slate-500">
                  Last active {d.last_seen_at ? dayjs(d.last_seen_at).fromNow() : "unknown"}
                </div>
              </div>
              <Button
                danger
                size="small"
                loading={acting}
                onClick={() => void revokeAndApprove(d.id)}
              >
                Revoke & approve new
              </Button>
            </div>
          ))}
        </Space>
      </Modal>
    </>
  );
}
