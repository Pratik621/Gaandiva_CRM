"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";

type ActivityLite = {
  related_to_id: string;
  activity_date: string;
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

type ContactRow = {
  id: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  account_id: string | null;
  account_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  status?: string | null;
};

const { Title, Text } = Typography;

export default function SalesContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; company_name: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [createdPreset, setCreatedPreset] = useState<DateRangeKey | undefined>();
  const [createdRange, setCreatedRange] = useState<[any, any] | null>(null); // used only when createdPreset === "search"
  const [lastActivityRange, setLastActivityRange] = useState<[any, any] | null>(null);
  const [lastActivityByContactId, setLastActivityByContactId] = useState<Record<string, string>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<ContactRow[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [taskForm] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [res, actRes] = await Promise.all([
        fetch("/api/sales/contacts", { credentials: "include" }),
        fetch("/api/sales/activities?related_to_type=contact", { credentials: "include" }),
      ]);
      const json = await res.json();
      const actJson = await actRes.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to load contacts");
      }
      setContacts(json.contacts ?? []);

      if (actRes.ok) {
        const map: Record<string, string> = {};
        ((actJson.activities ?? []) as ActivityLite[]).forEach((a) => {
          const prev = map[a.related_to_id];
          if (!prev || new Date(a.activity_date) > new Date(prev)) {
            map[a.related_to_id] = a.activity_date;
          }
        });
        setLastActivityByContactId(map);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/accounts", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) return;
      setAccounts(
        (json.accounts ?? []).map((a: any) => ({
          id: a.id as string,
          company_name: (a.company_name as string | null) ?? null,
        }))
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const createdPresetRange =
      createdPreset && createdPreset !== "search" ? rangeForCreatedDate(createdPreset) : null;
    const createdFrom = (createdPresetRange?.[0] ?? createdRange?.[0]) ?? null;
    const createdTo = (createdPresetRange?.[1] ?? createdRange?.[1]) ?? null;

    return contacts.filter((c) => {
      return (
        (!q ||
          (c.contact_name ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          (c.job_title ?? "").toLowerCase().includes(q) ||
          (c.account_name ?? "").toLowerCase().includes(q)) &&
        (statusFilter.length === 0 || statusFilter.includes((c.status ?? "").toLowerCase())) &&
        (!ownerFilter || c.owner_id === ownerFilter) &&
        (!createdFrom ||
          (c.created_at &&
            new Date(c.created_at) >= createdFrom.toDate() &&
            new Date(c.created_at) <= createdTo!.toDate())) &&
        (!lastActivityRange ||
          (lastActivityByContactId[c.id] &&
            new Date(lastActivityByContactId[c.id]) >= lastActivityRange[0].toDate() &&
            new Date(lastActivityByContactId[c.id]) <= lastActivityRange[1].toDate()))
      );
    });
  }, [
    contacts,
    search,
    statusFilter,
    ownerFilter,
    createdPreset,
    createdRange,
    lastActivityRange,
    lastActivityByContactId,
  ]);

  const ownerOptions = useMemo(() => {
    const owners = new Map<string, string>();
    contacts.forEach((c) => {
      if (c.owner_id) owners.set(c.owner_id, c.owner_name || "Unknown");
    });
    return Array.from(owners.entries()).map(([value, label]) => ({ value, label }));
  }, [contacts]);

  const columns: ColumnsType<ContactRow> = [
    {
      title: "Contact",
      dataIndex: "contact_name",
      key: "contact_name",
      width: 200,
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Lead Status",
      dataIndex: "status",
      key: "status",
      width: 140,
      ellipsis: true,
      render: (v: string | null | undefined) => {
        if (!v) return "—";
        const s = String(v).toLowerCase();
        const label =
          s === "new"
            ? "New"
            : s === "contacted"
              ? "Contacted"
              : s === "interested"
                ? "Qualified"
                : s === "closed_lost"
                  ? "Lost"
                  : v;
        return label;
      },
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      width: 220,
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
      title: "Job Title",
      dataIndex: "job_title",
      key: "job_title",
      width: 180,
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Account",
      dataIndex: "account_name",
      key: "account_name",
      width: 220,
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
    onChange: (keys: React.Key[], rows: ContactRow[]) => {
      setSelectedRowKeys(keys);
      setSelectedRows(rows);
    },
  } as const;

  const handleOpenAssign = () => {
    if (selectedRowKeys.length === 0) {
      message.warning("Please select at least one contact to assign.");
      return;
    }
    assignForm.resetFields();
    setAssignModalOpen(true);
  };

  const handleOpenEdit = () => {
    if (selectedRows.length !== 1) {
      message.warning("Please select exactly one contact to edit.");
      return;
    }
    const contact = selectedRows[0];
    setEditingContact(contact);
    editForm.setFieldsValue({
      contact_name: contact.contact_name ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      job_title: contact.job_title ?? "",
      account_id: contact.account_id ?? undefined,
      status: contact.status ?? undefined,
    });
    setEditModalOpen(true);
  };

  const handleAssignSubmit = async () => {
    try {
      const values = await assignForm.validateFields();
      const owner_id = values.owner_id || null;
      await Promise.all(
        selectedRows.map((row) =>
          fetch(`/api/sales/contacts/${row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ owner_id }),
          })
        )
      );
      message.success("Contacts updated");
      setAssignModalOpen(false);
      setSelectedRowKeys([]);
      setSelectedRows([]);
      fetchData();
    } catch (err) {
      if (err instanceof Error && err.message) {
        message.error(err.message);
      }
    }
  };

  const handleEditSubmit = async () => {
    if (!editingContact) return;
    try {
      const values = await editForm.validateFields();
      const payload: any = {};
      if (values.contact_name !== undefined) payload.contact_name = values.contact_name || null;
      if (values.email !== undefined) payload.email = values.email || null;
      if (values.phone !== undefined) payload.phone = values.phone || null;
      if (values.job_title !== undefined) payload.job_title = values.job_title || null;
      if (values.account_id !== undefined) payload.account_id = values.account_id || null;
      if (values.status !== undefined) payload.status = values.status || null;

      const res = await fetch(`/api/sales/contacts/${editingContact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update contact");
      }
      message.success("Contact updated");
      setEditModalOpen(false);
      setEditingContact(null);
      setSelectedRowKeys([]);
      setSelectedRows([]);
      fetchData();
    } catch (err) {
      if (err instanceof Error && err.message) {
        message.error(err.message);
      }
    }
  };

  const handleDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning("Please select at least one contact to delete.");
      return;
    }
    Modal.confirm({
      title: "Delete contacts",
      content: `Are you sure you want to delete ${selectedRowKeys.length} contact(s)? This cannot be undone.`,
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await Promise.all(
            selectedRows.map((row) =>
              fetch(`/api/sales/contacts/${row.id}`, {
                method: "DELETE",
                credentials: "include",
              })
            )
          );
          message.success("Contacts deleted");
          setSelectedRowKeys([]);
          setSelectedRows([]);
          fetchData();
        } catch (err) {
          if (err instanceof Error && err.message) {
            message.error(err.message);
          }
        }
      },
    });
  };

  const handleOpenTask = () => {
    if (selectedRowKeys.length === 0) {
      message.warning("Please select at least one contact to create tasks for.");
      return;
    }
    taskForm.resetFields();
    setTaskModalOpen(true);
  };

  const handleTaskSubmit = async () => {
    try {
      const values = await taskForm.validateFields();
      const payloadBase = {
        activity_type: values.activity_type,
        notes: values.notes || null,
        activity_date: values.activity_date
          ? dayjs(values.activity_date).toISOString()
          : null,
      };
      await Promise.all(
        selectedRows.map((row) =>
          fetch("/api/sales/activities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              ...payloadBase,
              related_to_type: "contact",
              related_to_id: row.id,
            }),
          })
        )
      );
      message.success("Tasks created");
      setTaskModalOpen(false);
      setSelectedRowKeys([]);
      setSelectedRows([]);
    } catch (err) {
      if (err instanceof Error && err.message) {
        message.error(err.message);
      }
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        contact_name: values.contact_name || null,
        email: values.email || null,
        phone: values.phone || null,
        job_title: values.job_title || null,
        account_id: values.account_id || null,

        // Leads parity fields (all optional)
        status: values.status || null,
        lead_source: values.lead_source || null,
        lead_score: typeof values.lead_score === "number" ? values.lead_score : null,
        first_name: values.first_name || null,
        last_name: values.last_name || null,
        alt_phone: values.alt_phone || null,
        linkedin: values.linkedin || null,
        department: values.department || null,
        website: values.website || null,
        industry: values.industry || null,
        company_size: values.company_size || null,
        annual_revenue: values.annual_revenue || null,
        business_type: values.business_type || null,
        gst_number: values.gst_number || null,
        pan_number: values.pan_number || null,
        country: values.country || null,
        state: values.state || null,
        city: values.city || null,
        zip: values.zip || null,
        address: values.address || null,
        budget: values.budget || null,
        decision_maker: values.decision_maker || null,
        purchase_timeline: values.purchase_timeline || null,
        current_solution: values.current_solution || null,
        pain_points: values.pain_points || null,
        requirements: values.requirements || null,
        source_type: values.source_type || null,
        source_campaign: values.source_campaign || null,
        utm_source: values.utm_source || null,
        utm_medium: values.utm_medium || null,
        utm_campaign: values.utm_campaign || null,
        deal_stage: values.deal_stage || null,
        deal_value: values.deal_value || null,
        probability: typeof values.probability === "number" ? values.probability : null,
        expected_close_date: values.expected_close_date
          ? dayjs(values.expected_close_date).toISOString()
          : null,
        product_interest: values.product_interest || null,
        last_contacted: values.last_contacted ? dayjs(values.last_contacted).toISOString() : null,
        next_followup: values.next_followup ? dayjs(values.next_followup).toISOString() : null,
        followup_type: values.followup_type || null,
        interaction_notes: values.interaction_notes || null,
        qualification_status: values.qualification_status || null,
        qa_status: values.qa_status || null,
        disqualification_reason: values.disqualification_reason || null,
        rectified_reason: values.rectified_reason || null,
        tags: Array.isArray(values.tags) ? values.tags : null,
      };

      const res = await fetch("/api/sales/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create contact");
      }
      message.success("Contact created");
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
            Contacts
          </Title>
          <Text type="secondary">
            People at your customer and prospect accounts. Each contact can be linked to deals and activities.
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
          New Contact
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
              placeholder="Search by contact, email, phone, job title or account..."
              prefix={<SearchOutlined style={{ color: "#9ca3af" }} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} lg={5}>
            <Select
              allowClear
              mode="multiple"
              maxTagCount="responsive"
              showSearch
              optionFilterProp="label"
              placeholder="Lead status"
              style={{ width: "100%" }}
              value={statusFilter}
              onChange={(v) => setStatusFilter((v as string[]) ?? [])}
              options={[
                { value: "new", label: "New" },
                { value: "contacted", label: "Contacted" },
                { value: "interested", label: "Qualified" },
                { value: "closed_lost", label: "Lost" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} lg={5}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Contact owner"
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

      <Card
        bodyStyle={{ padding: 0 }}
        style={{
          borderRadius: 16,
          boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
        }}
      >
        {selectedRowKeys.length > 0 && (
          <div
            style={{
              padding: 12,
              borderBottom: "1px solid #f0f0f0",
              background: "#fafafa",
            }}
          >
            <Space wrap style={{ display: "flex", justifyContent: "space-between" }}>
              <Text strong>
                Contact Selected ({selectedRowKeys.length})
              </Text>
              <Space wrap>
                <Button onClick={handleOpenAssign}>
                  Assign
                </Button>
                <Button
                  onClick={handleOpenEdit}
                  disabled={selectedRowKeys.length !== 1}
                >
                  Edit
                </Button>
                <Button danger onClick={handleDelete}>
                  Delete
                </Button>
                <Button type="primary" onClick={handleOpenTask}>
                  Create Tasks
                </Button>
              </Space>
            </Space>
          </div>
        )}
        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={filteredContacts}
          loading={loading}
          rowKey="id"
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showTotal: (t) => `Total ${t} contacts`,
          }}
          size="middle"
        />
      </Card>

      <Modal
        title="Assign owner"
        open={assignModalOpen}
        onCancel={() => setAssignModalOpen(false)}
        onOk={handleAssignSubmit}
        okText="Update owner"
        destroyOnClose
      >
        <Form form={assignForm} layout="vertical">
          <Form.Item name="owner_id" label="Contact owner">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select owner"
              options={ownerOptions}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit contact"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingContact(null);
        }}
        onOk={handleEditSubmit}
        okText="Save changes"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="contact_name"
            label="Contact Name"
            rules={[{ required: true, message: "Please enter contact name" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input type="email" placeholder="name@company.com" />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input placeholder="+1 (555) 000-0000" />
          </Form.Item>
          <Form.Item name="job_title" label="Job Title">
            <Input />
          </Form.Item>
          <Form.Item name="account_id" label="Account">
            <Select
              allowClear
              showSearch
              placeholder="Select account (optional)"
              optionFilterProp="label"
              options={accounts.map((a) => ({
                value: a.id,
                label: a.company_name || a.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="status" label="Lead Status">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={[
                { value: "new", label: "New" },
                { value: "contacted", label: "Contacted" },
                { value: "interested", label: "Qualified" },
                { value: "closed_lost", label: "Lost" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Create tasks for contacts"
        open={taskModalOpen}
        onCancel={() => setTaskModalOpen(false)}
        onOk={handleTaskSubmit}
        okText="Create tasks"
        destroyOnClose
      >
        <Form form={taskForm} layout="vertical">
          <Form.Item
            name="activity_type"
            label="Task type"
            rules={[{ required: true, message: "Please select task type" }]}
          >
            <Select
              placeholder="Select task type"
              options={[
                { value: "call", label: "Call" },
                { value: "email", label: "Email" },
                { value: "meeting", label: "Meeting" },
                { value: "demo", label: "Demo" },
              ]}
            />
          </Form.Item>
          <Form.Item name="activity_date" label="Due date">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="New Contact"
        placement="right"
        width={520}
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
              Create contact
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Title level={5} style={{ marginTop: 0 }}>
            Basic Contact Information
          </Title>
          <Form.Item
            name="contact_name"
            label="Contact Name"
            rules={[{ required: true, message: "Please enter contact name" }]}
          >
            <Input />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="status" label="Lead Status">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={[
                    { value: "new", label: "New" },
                    { value: "contacted", label: "Contacted" },
                    { value: "interested", label: "Qualified" },
                    { value: "closed_lost", label: "Lost" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lead_source" label="Lead Source">
                <Input placeholder="Website, Campaign, Referral, etc." />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="lead_score" label="Lead Score">
            <InputNumber min={0} max={100} style={{ width: "100%" }} />
          </Form.Item>

          <Title level={5} style={{ marginTop: 24 }}>
            Contact Person Details
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="first_name" label="First Name">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="last_name" label="Last Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="email" label="Email">
            <Input type="email" placeholder="name@company.com" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="phone" label="Mobile Number">
                <Input placeholder="+1 (555) 000-0000" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="alt_phone" label="Alternate Phone Number">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="job_title" label="Job Title / Designation">
            <Input />
          </Form.Item>
          <Form.Item name="linkedin" label="LinkedIn Profile">
            <Input placeholder="https://linkedin.com/in/..." />
          </Form.Item>
          <Form.Item name="department" label="Department">
            <Input />
          </Form.Item>

          <Title level={5} style={{ marginTop: 24 }}>
            Company Information
          </Title>
          <Form.Item name="website" label="Company Website">
            <Input placeholder="https://company.com" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="industry" label="Industry">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="company_size" label="Company Size (Employees)">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="annual_revenue" label="Annual Revenue">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="business_type" label="Business Type">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="gst_number" label="GST Number">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pan_number" label="PAN Number">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Title level={5} style={{ marginTop: 24 }}>
            Address Details
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="country" label="Country">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="state" label="State">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="city" label="City">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="zip" label="Zip / Postal Code">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="Full Address">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Title level={5} style={{ marginTop: 24 }}>
            Sales Qualification
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="budget" label="Budget">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="decision_maker" label="Decision Maker (Yes/No)">
                <Select
                  allowClear
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="purchase_timeline" label="Purchase Timeline">
            <Input />
          </Form.Item>
          <Form.Item name="current_solution" label="Current Solution / Vendor">
            <Input />
          </Form.Item>
          <Form.Item name="pain_points" label="Pain Points">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="requirements" label="Requirements / Notes">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Title level={5} style={{ marginTop: 24 }}>
            Lead Source & Tracking
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="source_type" label="Source Type">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="source_campaign" label="Source Campaign">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="utm_source" label="UTM Source">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="utm_medium" label="UTM Medium">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="utm_campaign" label="UTM Campaign">
            <Input />
          </Form.Item>

          <Title level={5} style={{ marginTop: 24 }}>
            Sales Pipeline
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="deal_stage" label="Deal Stage">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deal_value" label="Deal Value">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="probability" label="Probability (%)">
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expected_close_date" label="Expected Close Date">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="product_interest" label="Product Interest">
            <Input />
          </Form.Item>

          <Title level={5} style={{ marginTop: 24 }}>
            Activity & Tracking
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="last_contacted" label="Last Contacted Date">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="next_followup" label="Next Follow-up Date">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="followup_type" label="Follow-up Type">
            <Select
              allowClear
              options={[
                { value: "call", label: "Call" },
                { value: "email", label: "Email" },
                { value: "meeting", label: "Meeting" },
              ]}
            />
          </Form.Item>
          <Form.Item name="interaction_notes" label="Interaction Notes">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Title level={5} style={{ marginTop: 24 }}>
            Qualification & Disqualification
          </Title>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="qualification_status" label="Lead Qualification Status">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="qa_status" label="QA Status">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="disqualification_reason" label="Disqualification Reason">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="rectified_reason" label="Rectified Reason">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item name="tags" label="Tags / Labels">
            <Select
              mode="tags"
              tokenSeparators={[","]}
              placeholder="Add tags like: high-priority, partner, etc."
            />
          </Form.Item>

          <Form.Item name="account_id" label="Account">
            <Select
              allowClear
              showSearch
              placeholder="Select account (optional)"
              optionFilterProp="label"
              options={accounts.map((a) => ({
                value: a.id,
                label: a.company_name || a.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

