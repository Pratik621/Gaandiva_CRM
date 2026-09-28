"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Input,
  Select,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { DownloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import { usePaginatedListQuery } from "@/hooks/usePaginatedListQuery";

const { Title, Text } = Typography;

type LogRow = {
  id: string;
  actor_name: string | null;
  actor_role?: string | null;
  category?: string | null;
  event_type: string;
  description?: string | null;
  target_label?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  auth: "blue",
  leads: "green",
  campaigns: "geekblue",
  users: "purple",
  permissions: "red",
  exports: "orange",
  clients: "cyan",
  announcements: "magenta",
  lead_finder: "gold",
  system: "default",
};

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  ...Object.keys(CATEGORY_COLORS).map((c) => ({
    value: c,
    label: c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
  })),
];

function LogTable({ tab }: { tab: "activity" | "security" | "logins" }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const params = {
    tab,
    page,
    limit: pageSize,
    category: tab === "activity" ? category || undefined : undefined,
    q: debounced || undefined,
    date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
    date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
  };

  const { items, pagination, isLoading, error } = usePaginatedListQuery<LogRow>({
    queryKeyPrefix: ["admin", "audit-logs", tab],
    url: "/api/admin/audit-logs",
    params,
    listField: "logs",
  });

  useEffect(() => {
    if (error) {
      message.error(error instanceof Error ? error.message : "Failed to load audit logs");
    }
  }, [error]);

  const handleExport = () => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && key !== "page" && key !== "limit") sp.set(key, String(value));
    }
    sp.set("format", "csv");
    window.open(`/api/admin/audit-logs?${sp.toString()}`, "_blank");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {tab !== "logins" ? (
          <Input.Search
            placeholder={tab === "activity" ? "Search description / event / target" : "Search event type"}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ width: 300 }}
            allowClear
          />
        ) : null}
        {tab === "activity" ? (
          <Select
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            options={CATEGORY_OPTIONS}
            style={{ width: 180 }}
          />
        ) : null}
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(range) => {
            setDateRange(range as [Dayjs | null, Dayjs | null] | null);
            setPage(1);
          }}
        />
        <Button icon={<DownloadOutlined />} onClick={handleExport}>
          Export CSV
        </Button>
      </div>

      <Table<LogRow>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={items}
        pagination={{
          current: page,
          pageSize,
          total: pagination?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total.toLocaleString()} events`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        expandable={{
          expandedRowRender: (row) => (
            <pre style={{ margin: 0, fontSize: 12, maxHeight: 260, overflow: "auto" }}>
              {JSON.stringify(
                { metadata: row.metadata ?? null, ip: row.ip ?? null, user_agent: row.user_agent ?? null },
                null,
                2
              )}
            </pre>
          ),
          rowExpandable: (row) => Boolean(row.metadata || row.ip || row.user_agent),
        }}
        columns={[
          {
            title: "Time",
            dataIndex: "created_at",
            width: 165,
            render: (v: string) => (
              <Text style={{ fontSize: 12 }}>{new Date(v).toLocaleString()}</Text>
            ),
          },
          {
            title: "User",
            dataIndex: "actor_name",
            width: 160,
            ellipsis: true,
            render: (v: string | null, row) => (
              <span>
                <Text strong style={{ fontSize: 13 }}>
                  {v ?? "System"}
                </Text>
                {row.actor_role ? (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {" "}
                    ({row.actor_role})
                  </Text>
                ) : null}
              </span>
            ),
          },
          ...(tab === "activity"
            ? [
                {
                  title: "Category",
                  dataIndex: "category",
                  width: 130,
                  render: (v: string | null) =>
                    v ? (
                      <Tag color={CATEGORY_COLORS[v] ?? "default"}>{v.replace(/_/g, " ")}</Tag>
                    ) : null,
                },
              ]
            : []),
          {
            title: "Event",
            dataIndex: "event_type",
            width: 190,
            render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
          },
          ...(tab === "activity"
            ? [
                {
                  title: "Description",
                  dataIndex: "description",
                  ellipsis: true,
                  render: (v: string | null) => <Text style={{ fontSize: 13 }}>{v ?? "—"}</Text>,
                },
              ]
            : [
                {
                  title: tab === "logins" ? "Device" : "IP",
                  dataIndex: tab === "logins" ? "user_agent" : "ip",
                  ellipsis: true,
                  render: (v: string | null) => (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {v ?? "—"}
                    </Text>
                  ),
                },
              ]),
        ]}
      />
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <div style={{ padding: "0 4px" }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 8 }} />
          Audit Logs
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Complete activity history — every important action, who did it, and when
        </Text>
      </div>

      <Card style={{ borderRadius: 12 }} styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          defaultActiveKey="activity"
          items={[
            { key: "activity", label: "Activity", children: <LogTable tab="activity" /> },
            { key: "security", label: "Security", children: <LogTable tab="security" /> },
            { key: "logins", label: "Logins", children: <LogTable tab="logins" /> },
          ]}
        />
      </Card>
    </div>
  );
}
