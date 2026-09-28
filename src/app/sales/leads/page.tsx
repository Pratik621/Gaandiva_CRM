"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  DatePicker,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { LEAD_STATUS_OPTIONS } from "@/constants/salesLeadForm";
import {
  serverTableInitialLoading,
  useServerTablePagination,
  useSyncListPaginationTotal,
} from "@/hooks/useServerTablePagination";
import { buildListApiUrl } from "@/lib/build-list-api-url";

type LeadRow = {
  id: string;
  lead_name: string | null;
  // Contact
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  alt_phone: string | null;
  job_title: string | null;
  linkedin: string | null;
  department: string | null;
  // Company
  company: string | null;
  account_id?: string | null;
  account_company_name?: string | null;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  annual_revenue: string | null;
  business_type: string | null;
  gst_number: string | null;
  pan_number: string | null;
  // Address
  country: string | null;
  state: string | null;
  city: string | null;
  zip: string | null;
  address: string | null;
  // Qualification
  budget: string | null;
  decision_maker: string | null;
  purchase_timeline: string | null;
  current_solution: string | null;
  pain_points: string | null;
  requirements: string | null;
  // Source & tracking
  lead_source: string | null;
  source_type: string | null;
  source_campaign: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  // Pipeline
  lead_score: string | number | null;
  deal_stage: string | null;
  deal_value: string | null;
  probability: number | null;
  expected_close_date: string | null;
  product_interest: string | null;
  // Activity
  last_contacted: string | null;
  next_followup: string | null;
  followup_type: string | null;
  interaction_notes: string | null;
  // Qualification & QA
  qualification_status: string | null;
  qa_status: string | null;
  disqualification_reason: string | null;
  rectified_reason: string | null;
  // Ownership & audit
  status: string;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  created_at: string;
  created_by_name?: string | null;
  updated_at?: string | null;
  // Tags
  tags?: string[] | null;
  // Conversion
  converted?: boolean | null;
  converted_at?: string | null;
};

type AgentOption = {
  id: string;
  name: string;
  department: string | null;
};

dayjs.extend(quarterOfYear);

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

const STATUS_COLORS: Record<string, string> = {
  new: "blue",
  open: "cyan",
  in_progress: "processing",
  open_deal: "purple",
  unqualified: "red",
  attempted_to_contact: "orange",
  connected: "green",
  bad_timing: "default",
  contacted: "gold",
  interested: "green",
  closed_lost: "red",
  converted: "purple",
};

const { Title, Text } = Typography;

export default function SalesLeadsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>();
  const [createdPreset, setCreatedPreset] = useState<DateRangeKey | undefined>();
  const [createdRange, setCreatedRange] = useState<[any, any] | null>(null);
  const [lastActivityRange, setLastActivityRange] = useState<[any, any] | null>(null);
  const { page, pageSize, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, statusFilter, ownerFilter, createdPreset, createdRange, lastActivityRange, resetPage]);

  const listUrl = buildListApiUrl("/api/sales/leads", {
    page,
    limit: pageSize,
    q: debouncedSearch || undefined,
  });

  const leadsQuery = useQuery({
    queryKey: ["sales", "leads", "list", listUrl],
    queryFn: async () => {
      const [res, actRes] = await Promise.all([
        fetch(listUrl, { credentials: "include" }),
        fetch("/api/sales/activities?related_to_type=lead", { credentials: "include" }),
      ]);
      const json = await res.json();
      const actJson = await actRes.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to load leads");
      }

      const lastActivityByLeadId: Record<string, string> = {};
      if (actRes.ok) {
        ((actJson.activities ?? []) as { related_to_id: string; activity_date: string }[]).forEach(
          (a) => {
            const prev = lastActivityByLeadId[a.related_to_id];
            if (!prev || new Date(a.activity_date) > new Date(prev)) {
              lastActivityByLeadId[a.related_to_id] = a.activity_date;
            }
          }
        );
      }

      return {
        leads: (json.leads ?? []) as LeadRow[],
        agents: (json.agents ?? []) as AgentOption[],
        pagination: json.pagination as
          | { page: number; limit: number; total: number; totalPages: number }
          | undefined,
        lastActivityByLeadId,
      };
    },
    placeholderData: (previous) => previous,
  });

  const leads = useMemo(() => leadsQuery.data?.leads ?? [], [leadsQuery.data?.leads]);
  const agents = leadsQuery.data?.agents ?? [];
  const lastActivityByLeadId = useMemo(
    () => leadsQuery.data?.lastActivityByLeadId ?? {},
    [leadsQuery.data?.lastActivityByLeadId]
  );
  const loading = serverTableInitialLoading(leadsQuery.isLoading, leads.length);

  useSyncListPaginationTotal(leadsQuery.data?.pagination, applyPaginationMeta);

  useEffect(() => {
    if (leadsQuery.error) {
      message.error(
        leadsQuery.error instanceof Error ? leadsQuery.error.message : "Failed to load leads"
      );
    }
  }, [leadsQuery.error]);


  const filteredLeads = useMemo(() => {
    const createdPresetRange =
      createdPreset && createdPreset !== "search" ? rangeForCreatedDate(createdPreset) : null;
    const createdFrom = (createdPresetRange?.[0] ?? createdRange?.[0]) ?? null;
    const createdTo = (createdPresetRange?.[1] ?? createdRange?.[1]) ?? null;

    return leads.filter((l) => {
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(l.status);
      const matchesOwner = !ownerFilter || l.assigned_to_id === ownerFilter;
      const matchesCreated =
        !createdFrom ||
        (l.created_at &&
          new Date(l.created_at) >= createdFrom.toDate() &&
          new Date(l.created_at) <= createdTo!.toDate());
      const lastAct = lastActivityByLeadId[l.id];
      const matchesLastActivity =
        !lastActivityRange ||
        (lastAct &&
          new Date(lastAct) >= lastActivityRange[0].toDate() &&
          new Date(lastAct) <= lastActivityRange[1].toDate());
      return matchesStatus && matchesOwner && matchesCreated && matchesLastActivity;
    });
  }, [
    leads,
    statusFilter,
    ownerFilter,
    createdPreset,
    createdRange,
    lastActivityRange,
    lastActivityByLeadId,
  ]);

  const rowSelection = {
    preserveSelectedRowKeys: true,
    columnWidth: 48,
  } as const;

  const columns: ColumnsType<LeadRow> = [
    {
      title: "Lead Name",
      dataIndex: "lead_name",
      key: "lead_name",
      width: 160,
      ellipsis: true,
      render: (v: string | null, record: LeadRow) =>
        v ? (
          <Link href={`/sales/leads/${record.id}`} style={{ fontWeight: 600, color: "#4f46e5" }}>
            {v}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      title: "Company",
      dataIndex: "company",
      key: "company",
      width: 160,
      ellipsis: true,
      render: (v: string | null, record: LeadRow) => {
        if (!v) return "—";
        if (record.account_id) {
          return (
            <Link
              href={`/sales/accounts?highlight=${record.account_id}`}
              style={{ fontWeight: 500 }}
            >
              {v}
            </Link>
          );
        }
        return v;
      },
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      width: 200,
      ellipsis: true,
      render: (v: string | null) => v || "—",
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
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 140,
      filters: [
        ...LEAD_STATUS_OPTIONS.map((o) => ({ text: o.label, value: o.value })),
        { text: "Converted", value: "converted" },
      ],
      onFilter: (value, record) => record.status === String(value),
      render: (v: string, record: LeadRow) => (
        <Space size={4} direction="vertical" style={{ gap: 2 }}>
          <Tag color={STATUS_COLORS[v] ?? "default"} style={{ margin: 0 }}>
            {v === "converted"
              ? "Converted"
              : LEAD_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v}
          </Tag>
          {record.converted && record.converted_at && (
            <span style={{ fontSize: 11, color: "#6b7280" }}>
              {new Date(record.converted_at).toLocaleDateString()}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: "Lead Owner",
      dataIndex: "assigned_to_name",
      key: "assigned_to_name",
      width: 180,
      ellipsis: true,
      render: (v: string | null) => v || "Unassigned",
    },
  ];

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
            Leads
          </Title>
          <Text type="secondary">
            Manage and qualify leads before converting them into contacts and accounts.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/sales/leads/new")}>
          New Lead
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
              placeholder="Search by name, company, email, phone or source..."
              prefix={<SearchOutlined style={{ color: "#9ca3af" }} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} lg={7}>
            <Select
              allowClear
              mode="multiple"
              maxTagCount="responsive"
              showSearch
              optionFilterProp="label"
              placeholder="Filter by status"
              style={{ width: "100%" }}
              value={statusFilter}
              onChange={(v) => setStatusFilter((v as string[]) ?? [])}
              options={[
                ...LEAD_STATUS_OPTIONS,
                { value: "converted", label: "Converted" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} lg={7}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Filter by owner"
              style={{ width: "100%" }}
              value={ownerFilter}
              onChange={setOwnerFilter}
              options={agents.map((a) => ({
                value: a.id,
                label: a.name,
              }))}
            />
          </Col>
          <Col xs={24} sm={12} lg={7}>
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
          <Col xs={24} sm={12} lg={7}>
            <DatePicker.RangePicker
              style={{ width: "100%" }}
              placeholder={["Custom from", "to"]}
              disabled={createdPreset !== "search"}
              value={createdRange as any}
              onChange={(v) => setCreatedRange((v as any) ?? null)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} lg={7}>
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

      <Card
        bodyStyle={{ padding: 0 }}
        style={{
          borderRadius: 16,
          boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
        }}
      >
        <style>{`
          .leads-table .ant-table-selection-column .ant-checkbox-inner {
            width: 18px;
            height: 18px;
          }
          .leads-table .ant-table-selection-column .ant-checkbox-inner::after {
            width: 6px;
            height: 10px;
          }
        `}</style>
        <Table
          className="leads-table"
          rowSelection={rowSelection}
          columns={columns}
          dataSource={filteredLeads}
          loading={loading}
          rowKey="id"
          scroll={{ x: 900, y: 480 }}
          pagination={tablePagination}
          size="middle"
        />
      </Card>

    </div>
  );
}
