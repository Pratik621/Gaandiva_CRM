"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";

dayjs.extend(quarterOfYear);

type AccountRow = {
  id: string;
  company_name: string | null;
  industry: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
};

type ActivityLite = {
  related_to_id: string;
  activity_date: string;
};

type DateRangeKey =
  | "search"
  | "today"
  | "all_today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "this_week_so_far"
  | "last_week"
  | "next_week"
  | "this_month"
  | "this_month_so_far"
  | "last_month"
  | "next_month"
  | "this_quarter"
  | "this_fiscal_quarter"
  | "this_quarter_so_far"
  | "this_fiscal_quarter_so_far"
  | "last_quarter"
  | "last_fiscal_quarter"
  | "next_quarter"
  | "next_fiscal_quarter"
  | "this_year"
  | "this_fiscal_year"
  | "this_year_so_far"
  | "this_fiscal_year_so_far"
  | "last_year"
  | "last_fiscal_year"
  | "next_year"
  | "next_fiscal_year"
  | "last_7_days"
  | "last_14_days"
  | "last_30_days"
  | "last_60_days"
  | "last_90_days"
  | "last_180_days"
  | "last_365_days";

const CREATED_DATE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: "search", label: "Search" },
  { value: "today", label: "Today" },
  { value: "all_today", label: "All of today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This week" },
  { value: "this_week_so_far", label: "This week so far" },
  { value: "last_week", label: "Last week" },
  { value: "next_week", label: "Next week" },
  { value: "this_month", label: "This month" },
  { value: "this_month_so_far", label: "This month so far" },
  { value: "last_month", label: "Last month" },
  { value: "next_month", label: "Next month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_fiscal_quarter", label: "This fiscal quarter" },
  { value: "this_quarter_so_far", label: "This quarter so far" },
  { value: "this_fiscal_quarter_so_far", label: "This fiscal quarter so far" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "last_fiscal_quarter", label: "Last fiscal quarter" },
  { value: "next_quarter", label: "Next quarter" },
  { value: "next_fiscal_quarter", label: "Next fiscal quarter" },
  { value: "this_year", label: "This year" },
  { value: "this_fiscal_year", label: "This fiscal year" },
  { value: "this_year_so_far", label: "This year so far" },
  { value: "this_fiscal_year_so_far", label: "This fiscal year so far" },
  { value: "last_year", label: "Last year" },
  { value: "last_fiscal_year", label: "Last fiscal year" },
  { value: "next_year", label: "Next year" },
  { value: "next_fiscal_year", label: "Next fiscal year" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_14_days", label: "Last 14 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_60_days", label: "Last 60 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "last_180_days", label: "Last 180 days" },
  { value: "last_365_days", label: "Last 365 days" },
];

function startOfWeekMonday(d: dayjs.Dayjs) {
  const dow = d.day(); // 0 Sun .. 6 Sat
  const diff = (dow + 6) % 7; // Mon=0 ... Sun=6
  return d.subtract(diff, "day").startOf("day");
}

function endOfWeekSunday(d: dayjs.Dayjs) {
  return startOfWeekMonday(d).add(6, "day").endOf("day");
}

function getFiscalYearStart(d: dayjs.Dayjs) {
  // Fiscal year: Apr 1 -> Mar 31
  const fiscalStartMonth = 3; // 0-based: 3 = April
  const y = d.month() >= fiscalStartMonth ? d.year() : d.year() - 1;
  return dayjs(new Date(y, fiscalStartMonth, 1)).startOf("day");
}

function getFiscalQuarterStart(d: dayjs.Dayjs) {
  const fyStart = getFiscalYearStart(d); // Apr 1
  const monthsSince = d.diff(fyStart, "month");
  const qIndex = Math.floor(monthsSince / 3);
  return fyStart.add(qIndex * 3, "month").startOf("day");
}

function rangeForCreatedDate(key: DateRangeKey, now = dayjs()): [dayjs.Dayjs, dayjs.Dayjs] | null {
  const todayStart = now.startOf("day");
  const todayEnd = now.endOf("day");
  const yesterdayStart = todayStart.subtract(1, "day");
  const yesterdayEnd = todayEnd.subtract(1, "day");
  const tomorrowStart = todayStart.add(1, "day");
  const tomorrowEnd = todayEnd.add(1, "day");

  switch (key) {
    case "search":
      return null;
    case "today":
    case "all_today":
      return [todayStart, todayEnd];
    case "yesterday":
      return [yesterdayStart, yesterdayEnd];
    case "tomorrow":
      return [tomorrowStart, tomorrowEnd];
    case "this_week": {
      const s = startOfWeekMonday(now);
      return [s, endOfWeekSunday(s)];
    }
    case "this_week_so_far": {
      const s = startOfWeekMonday(now);
      return [s, now.endOf("day")];
    }
    case "last_week": {
      const s = startOfWeekMonday(now).subtract(7, "day");
      return [s, endOfWeekSunday(s)];
    }
    case "next_week": {
      const s = startOfWeekMonday(now).add(7, "day");
      return [s, endOfWeekSunday(s)];
    }
    case "this_month":
      return [now.startOf("month").startOf("day"), now.endOf("month").endOf("day")];
    case "this_month_so_far":
      return [now.startOf("month").startOf("day"), now.endOf("day")];
    case "last_month": {
      const d = now.subtract(1, "month");
      return [d.startOf("month").startOf("day"), d.endOf("month").endOf("day")];
    }
    case "next_month": {
      const d = now.add(1, "month");
      return [d.startOf("month").startOf("day"), d.endOf("month").endOf("day")];
    }
    case "this_quarter":
      return [now.startOf("quarter").startOf("day"), now.endOf("quarter").endOf("day")];
    case "this_quarter_so_far":
      return [now.startOf("quarter").startOf("day"), now.endOf("day")];
    case "last_quarter": {
      const d = now.subtract(1, "quarter");
      return [d.startOf("quarter").startOf("day"), d.endOf("quarter").endOf("day")];
    }
    case "next_quarter": {
      const d = now.add(1, "quarter");
      return [d.startOf("quarter").startOf("day"), d.endOf("quarter").endOf("day")];
    }
    case "this_year":
      return [now.startOf("year").startOf("day"), now.endOf("year").endOf("day")];
    case "this_year_so_far":
      return [now.startOf("year").startOf("day"), now.endOf("day")];
    case "last_year": {
      const d = now.subtract(1, "year");
      return [d.startOf("year").startOf("day"), d.endOf("year").endOf("day")];
    }
    case "next_year": {
      const d = now.add(1, "year");
      return [d.startOf("year").startOf("day"), d.endOf("year").endOf("day")];
    }
    case "this_fiscal_year": {
      const s = getFiscalYearStart(now);
      return [s, s.add(1, "year").subtract(1, "day").endOf("day")];
    }
    case "this_fiscal_year_so_far": {
      const s = getFiscalYearStart(now);
      return [s, now.endOf("day")];
    }
    case "last_fiscal_year": {
      const s = getFiscalYearStart(now).subtract(1, "year");
      return [s, s.add(1, "year").subtract(1, "day").endOf("day")];
    }
    case "next_fiscal_year": {
      const s = getFiscalYearStart(now).add(1, "year");
      return [s, s.add(1, "year").subtract(1, "day").endOf("day")];
    }
    case "this_fiscal_quarter": {
      const s = getFiscalQuarterStart(now);
      return [s, s.add(3, "month").subtract(1, "day").endOf("day")];
    }
    case "this_fiscal_quarter_so_far": {
      const s = getFiscalQuarterStart(now);
      return [s, now.endOf("day")];
    }
    case "last_fiscal_quarter": {
      const s = getFiscalQuarterStart(now).subtract(3, "month");
      return [s, s.add(3, "month").subtract(1, "day").endOf("day")];
    }
    case "next_fiscal_quarter": {
      const s = getFiscalQuarterStart(now).add(3, "month");
      return [s, s.add(3, "month").subtract(1, "day").endOf("day")];
    }
    case "last_7_days":
      return [todayStart.subtract(7, "day"), yesterdayEnd];
    case "last_14_days":
      return [todayStart.subtract(14, "day"), yesterdayEnd];
    case "last_30_days":
      return [todayStart.subtract(30, "day"), yesterdayEnd];
    case "last_60_days":
      return [todayStart.subtract(60, "day"), yesterdayEnd];
    case "last_90_days":
      return [todayStart.subtract(90, "day"), yesterdayEnd];
    case "last_180_days":
      return [todayStart.subtract(180, "day"), yesterdayEnd];
    case "last_365_days":
      return [todayStart.subtract(365, "day"), yesterdayEnd];
    default:
      return null;
  }
}

const { Title, Text } = Typography;

export default function SalesAccountsPage() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>();
  const [createdPreset, setCreatedPreset] = useState<DateRangeKey | undefined>();
  const [createdRange, setCreatedRange] = useState<[any, any] | null>(null);
  const [lastActivityRange, setLastActivityRange] = useState<[any, any] | null>(null);
  const [lastActivityByAccountId, setLastActivityByAccountId] = useState<Record<string, string>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [res, actRes] = await Promise.all([
        fetch("/api/sales/accounts", { credentials: "include" }),
        fetch("/api/sales/activities?related_to_type=account", { credentials: "include" }),
      ]);
      const json = await res.json();
      const actJson = await actRes.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to load accounts");
      }
      setAccounts(json.accounts ?? []);

      if (actRes.ok) {
        const map: Record<string, string> = {};
        ((actJson.activities ?? []) as ActivityLite[]).forEach((a) => {
          const prev = map[a.related_to_id];
          if (!prev || new Date(a.activity_date) > new Date(prev)) {
            map[a.related_to_id] = a.activity_date;
          }
        });
        setLastActivityByAccountId(map);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const createdPresetRange =
      createdPreset && createdPreset !== "search" ? rangeForCreatedDate(createdPreset) : null;
    const createdFrom = (createdPresetRange?.[0] ?? createdRange?.[0]) ?? null;
    const createdTo = (createdPresetRange?.[1] ?? createdRange?.[1]) ?? null;

    return accounts.filter((a) => {
      return (
        (!q ||
          (a.company_name ?? "").toLowerCase().includes(q) ||
          (a.industry ?? "").toLowerCase().includes(q) ||
          (a.website ?? "").toLowerCase().includes(q) ||
          (a.phone ?? "").toLowerCase().includes(q) ||
          (a.address ?? "").toLowerCase().includes(q)) &&
        (!ownerFilter || a.owner_id === ownerFilter) &&
        (!createdFrom ||
          (a.created_at &&
            new Date(a.created_at) >= createdFrom.toDate() &&
            new Date(a.created_at) <= createdTo!.toDate())) &&
        (!lastActivityRange ||
          (lastActivityByAccountId[a.id] &&
            new Date(lastActivityByAccountId[a.id]) >= lastActivityRange[0].toDate() &&
            new Date(lastActivityByAccountId[a.id]) <= lastActivityRange[1].toDate()))
      );
    });
  }, [
    accounts,
    search,
    ownerFilter,
    createdPreset,
    createdRange,
    lastActivityRange,
    lastActivityByAccountId,
  ]);

  const ownerOptions = useMemo(() => {
    const owners = new Map<string, string>();
    accounts.forEach((a) => {
      if (a.owner_id) owners.set(a.owner_id, a.owner_name || "Unknown");
    });
    return Array.from(owners.entries()).map(([value, label]) => ({ value, label }));
  }, [accounts]);

  const columns: ColumnsType<AccountRow> = [
    {
      title: "Company",
      dataIndex: "company_name",
      key: "company_name",
      width: 220,
      ellipsis: true,
      render: (v: string | null, record: AccountRow) =>
        v ? (
          <Link href={`/sales/accounts/${record.id}`} style={{ fontWeight: 600, color: "#4f46e5" }}>
            {v}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      title: "Industry",
      dataIndex: "industry",
      key: "industry",
      width: 160,
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Website",
      dataIndex: "website",
      key: "website",
      width: 200,
      ellipsis: true,
      render: (v: string | null) =>
        v ? (
          <a href={v} target="_blank" rel="noreferrer">
            {v}
          </a>
        ) : (
          "—"
        ),
    },
    {
      title: "Phone",
      dataIndex: "phone",
      key: "phone",
      width: 140,
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Owner",
      dataIndex: "owner_name",
      key: "owner_name",
      width: 180,
      ellipsis: true,
      render: (v: string | null) => v || "Unassigned",
    },
    {
      title: "Created At",
      dataIndex: "created_at",
      key: "created_at",
      width: 140,
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
  ];

  const rowSelection = {
    preserveSelectedRowKeys: true,
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      setSelectedRowKeys(keys);
    },
  } as const;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        company_name: values.company_name || null,
        industry: values.industry || null,
        website: values.website || null,
        phone: values.phone || null,
        address: values.address || null,
      };

      const res = await fetch("/api/sales/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create account");
      }
      message.success("Account created");
      setDrawerOpen(false);
      form.resetFields();
      fetchData();
    } catch (err) {
      if (err instanceof Error && err.message) {
        message.error(err.message);
      }
    }
  };

  return (
    <div style={{ padding: "0 4px" }}>
      <div
        style={{
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0, fontSize: 26 }}>
            Accounts
          </Title>
          <Text type="secondary">
            Manage companies you work with. Each account can have multiple contacts and deals.
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            setDrawerOpen(true);
          }}
        >
          New Account
        </Button>
      </div>

      <Card
        bodyStyle={{ padding: 16 }}
        style={{
          borderRadius: 16,
          boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
          marginBottom: 24,
        }}
      >
        <Row gutter={[16, 16]} wrap>
          <Col xs={24} sm={12} lg={10}>
            <Input
              allowClear
              placeholder="Search by company, industry, website, phone or address..."
              prefix={<SearchOutlined style={{ color: "#9ca3af" }} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} lg={5}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Account owner"
              style={{ width: "100%" }}
              value={ownerFilter}
              onChange={setOwnerFilter}
              options={ownerOptions}
            />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Created date"
              style={{ width: "100%" }}
              value={createdPreset}
              onChange={(v) => {
                setCreatedPreset((v as DateRangeKey | undefined) ?? undefined);
                setCreatedRange(null);
              }}
              options={CREATED_DATE_OPTIONS}
            />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <DatePicker.RangePicker
              style={{ width: "100%" }}
              placeholder={["Custom from", "to"]}
              disabled={createdPreset !== "search"}
              value={createdRange as any}
              onChange={(v) => setCreatedRange((v as any) ?? null)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <DatePicker.RangePicker
              style={{ width: "100%" }}
              placeholder={["Last activity from", "to"]}
              value={lastActivityRange as any}
              onChange={(v) => setLastActivityRange((v as any) ?? null)}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      <style>{`
        .sales-account-row-highlight td {
          background: #eef2ff !important;
          box-shadow: inset 3px 0 0 0 #4f46e5;
        }
      `}</style>

      <Card
        bodyStyle={{ padding: 0 }}
        style={{
          borderRadius: 16,
          boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
        }}
      >
        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={filteredAccounts}
          loading={loading}
          rowKey="id"
          rowClassName={(record) =>
            highlightId && record.id === highlightId ? "sales-account-row-highlight" : ""
          }
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showTotal: (t) => `Total ${t} accounts`,
          }}
          size="middle"
        />
      </Card>

      <Drawer
        title="New Account"
        placement="right"
        width={420}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          form.resetFields();
        }}
        destroyOnClose
        extra={
          <Space>
            <Button
              onClick={() => {
                setDrawerOpen(false);
                form.resetFields();
              }}
            >
              Cancel
            </Button>
            <Button type="primary" onClick={handleSubmit}>
              Create account
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="company_name"
            label="Company Name"
            rules={[{ required: true, message: "Please enter company name" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="industry" label="Industry">
            <Input />
          </Form.Item>
          <Form.Item name="website" label="Website">
            <Input placeholder="https://company.com" />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input placeholder="+1 (555) 000-0000" />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

