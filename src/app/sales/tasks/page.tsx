"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  AlertOutlined,
  AppstoreOutlined,
  FlagOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";

dayjs.extend(relativeTime);

// ─── Types ────────────────────────────────────────────────────────────────────
type TaskPriority = "low" | "medium" | "high";
type TaskStatus   = "pending" | "in_progress" | "completed";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  related_type: string | null;
  related_id: string | null;
  related_name: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assigned_to: string | null;
  assigned_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

type Member = { id: string; label: string };
type LookupItem = { id: string; label: string };

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

// ─── Config ───────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; dot: string; antColor: string }
> = {
  low:    { label: "Low",    color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", dot: "#16a34a", antColor: "green"  },
  medium: { label: "Medium", color: "#b45309", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b", antColor: "gold"   },
  high:   { label: "High",   color: "#b91c1c", bg: "#fef2f2", border: "#fecaca", dot: "#ef4444", antColor: "red"    },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  pending:     { label: "Pending",     color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", icon: <ClockCircleOutlined /> },
  in_progress: { label: "In Progress", color: "#4338ca", bg: "#eff6ff", border: "#bfdbfe", icon: <AppstoreOutlined />    },
  completed:   { label: "Completed",   color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: <CheckCircleOutlined /> },
  overdue:     { label: "Overdue",     color: "#b91c1c", bg: "#fef2f2", border: "#fecaca", icon: <AlertOutlined />       },
};

const RELATED_COLORS: Record<string, string> = {
  lead:    "#6366f1",
  contact: "#10b981",
  deal:    "#f59e0b",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isOverdue(task: TaskRow): boolean {
  return !!(task.due_date && dayjs(task.due_date).isBefore(dayjs()) && task.status !== "completed");
}

function getDueDateDisplay(task: TaskRow): { label: string; color: string } {
  if (!task.due_date) return { label: "No due date", color: "#d1d5db" };
  const d = dayjs(task.due_date);
  if (task.status === "completed") {
    return { label: d.format("DD MMM YYYY, h:mm A"), color: "#9ca3af" };
  }
  if (isOverdue(task)) {
    return { label: `Overdue · ${d.format("DD MMM, h:mm A")} · ${d.fromNow()}`, color: "#b91c1c" };
  }
  return {
    label: `${d.format("DD MMM YYYY, h:mm A")} · ${d.fromNow()}`,
    color: "#374151",
  };
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, count, icon, color, bg, active, onClick }: {
  label: string; count: number; icon: React.ReactNode;
  color: string; bg: string; active: boolean; onClick: () => void;
}) {
  return (
    <Card
      hoverable
      onClick={onClick}
      styles={{ body: { padding: "14px 18px" } }}
      style={{
        borderRadius: 14,
        border: active ? `2px solid ${color}` : "1.5px solid #f0f0f0",
        background: active ? bg : "#fff",
        cursor: "pointer",
        boxShadow: active ? `0 4px 16px ${color}22` : "0 1px 4px rgba(0,0,0,0.05)",
        transition: "all 0.18s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            {label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: active ? color : "#111827", lineHeight: 1 }}>
            {count}
          </div>
        </div>
        <div style={{
          width: 42, height: 42, borderRadius: 11,
          background: active ? color : "#f3f4f6",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: active ? "#fff" : "#9ca3af", fontSize: 17,
          transition: "all 0.18s",
        }}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SalesTasksPage() {
  const { user, roles } = useAuth();
  const currentUserId = user?.id ?? "";
  const isManagerOrAdmin = roles.some((r) =>
    ["sales_manager", "admin"].includes(r.role_name.toLowerCase().replace(/\s+/g, "_"))
  );
  const isAdmin = roles.some((r) =>
    r.role_name.toLowerCase().replace(/\s+/g, "_") === "admin"
  );

  const [tasks,      setTasks]      = useState<TaskRow[]>([]);
  const [members,    setMembers]    = useState<Member[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);

  // Lookups for related records
  const [leads,    setLeads]    = useState<LookupItem[]>([]);
  const [contacts, setContacts] = useState<LookupItem[]>([]);
  const [deals,    setDeals]    = useState<LookupItem[]>([]);

  // Filters
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState<string | undefined>();
  const [priorityFilter,setPriorityFilter]= useState<string | undefined>();
  const [dateRange,     setDateRange]     = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [assigneeFilter,setAssigneeFilter]= useState<string | undefined>();

  const [form] = Form.useForm();
  const watchedRelatedType = Form.useWatch("related_type", form);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/sales/tasks", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load tasks");
      setTasks(json.tasks ?? []);
      setMembers(json.members ?? []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLookups = useCallback(async () => {
    try {
      const [lr, cr, dr] = await Promise.all([
        fetch("/api/sales/leads",    { credentials: "include" }),
        fetch("/api/sales/contacts", { credentials: "include" }),
        fetch("/api/sales/deals",    { credentials: "include" }),
      ]);
      const [lj, cj, dj] = await Promise.all([lr.json(), cr.json(), dr.json()]);
      if (lr.ok) setLeads(   (lj.leads    ?? []).map((x: any) => ({ id: x.id, label: x.lead_name    || "Unnamed" })));
      if (cr.ok) setContacts((cj.contacts ?? []).map((x: any) => ({ id: x.id, label: x.contact_name || "Unnamed" })));
      if (dr.ok) setDeals(   (dj.deals    ?? []).map((x: any) => ({ id: x.id, label: x.deal_name    || "Unnamed" })));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchTasks(); },   [fetchTasks]);
  useEffect(() => { fetchLookups(); }, [fetchLookups]);

  // ── Filtered tasks ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (assigneeFilter && t.assigned_to !== assigneeFilter) return false;

      if (statusFilter === "overdue") {
        if (!isOverdue(t)) return false;
      } else if (statusFilter) {
        if (t.status !== statusFilter) return false;
      }

      if (dateRange && t.due_date) {
        const d = dayjs(t.due_date);
        if (d.isBefore(dateRange[0], "day") || d.isAfter(dateRange[1], "day")) return false;
      }

      if (q) {
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.related_name  ?? "").toLowerCase().includes(q) ||
          (t.assigned_name ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tasks, search, statusFilter, priorityFilter, dateRange, assigneeFilter]);

  // ── Stat counts ───────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:       tasks.length,
    pending:     tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    overdue:     tasks.filter(isOverdue).length,
    completed:   tasks.filter((t) => t.status === "completed").length,
  }), [tasks]);

  // ── Related options for form ──────────────────────────────────────────────
  const relatedOptions = useMemo(() => {
    if (watchedRelatedType === "lead")    return leads;
    if (watchedRelatedType === "contact") return contacts;
    if (watchedRelatedType === "deal")    return deals;
    return [];
  }, [watchedRelatedType, leads, contacts, deals]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        title:        values.title?.trim(),
        description:  values.description?.trim() || null,
        related_type: values.related_type || null,
        related_id:   values.related_id   || null,
        due_date:     values.due_date ? dayjs(values.due_date).toISOString() : null,
        priority:     values.priority,
        status:       values.status,
        assigned_to:  values.assigned_to || null,
      };

      if (editingId) {
        const res  = await fetch(`/api/sales/tasks/${editingId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          credentials: "include", body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to update task");
        message.success("Task updated");
      } else {
        const res  = await fetch("/api/sales/tasks", {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include", body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to create task");
        message.success("Task created");
      }

      closeDrawer();
      fetchTasks();
    } catch (err) {
      if (err instanceof Error && err.message) message.error(err.message);
    }
  };

  const handleQuickStatus = async (id: string, newStatus: string) => {
    try {
      const res  = await fetch(`/api/sales/tasks/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update status");
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus as TaskStatus } : t));
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res  = await fetch(`/api/sales/tasks/${id}`, { method: "DELETE", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete task");
      message.success("Task deleted");
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  };

  const openEdit = (task: TaskRow) => {
    setEditingId(task.id);
    form.setFieldsValue({
      title:        task.title,
      description:  task.description ?? "",
      related_type: task.related_type ?? undefined,
      related_id:   task.related_id   ?? undefined,
      due_date:     task.due_date ? dayjs(task.due_date) : null,
      priority:     task.priority,
      status:       task.status,
      assigned_to:  task.assigned_to ?? undefined,
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    form.resetFields();
  };

  const clearFilters = () => {
    setSearch(""); setStatusFilter(undefined);
    setPriorityFilter(undefined); setDateRange(null); setAssigneeFilter(undefined);
  };
  const hasFilters = !!(search || statusFilter || priorityFilter || dateRange || assigneeFilter);

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns: ColumnsType<TaskRow> = [
    {
      title: "Priority",
      dataIndex: "priority",
      key: "priority",
      width: 105,
      sorter: (a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
      },
      render: (v: string) => {
        const cfg = PRIORITY_CONFIG[v];
        if (!cfg) return "—";
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
          </span>
        );
      },
    },
    {
      title: "Task",
      key: "title",
      ellipsis: false,
      render: (_: unknown, record: TaskRow) => (
        <div style={{ minWidth: 200 }}>
          <div style={{
            fontWeight: 600, fontSize: 13, color: record.status === "completed" ? "#9ca3af" : "#111827",
            textDecoration: record.status === "completed" ? "line-through" : "none",
            marginBottom: record.description || record.related_type ? 3 : 0,
          }}>
            {record.title}
          </div>
          {record.description && (
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5, marginBottom: 4 }}>
              {record.description.length > 80 ? record.description.slice(0, 80) + "…" : record.description}
            </div>
          )}
          {record.related_type && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 8,
              background: `${RELATED_COLORS[record.related_type] ?? "#9ca3af"}14`,
              color: RELATED_COLORS[record.related_type] ?? "#6b7280",
              border: `1px solid ${RELATED_COLORS[record.related_type] ?? "#9ca3af"}28`,
            }}>
              <LinkOutlined style={{ fontSize: 10 }} />
              <span style={{ textTransform: "capitalize" }}>{record.related_type}</span>
              {record.related_name && <span>· {record.related_name}</span>}
            </span>
          )}
        </div>
      ),
    },
    {
      title: "Due Date",
      dataIndex: "due_date",
      key: "due_date",
      width: 145,
      sorter: (a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return dayjs(a.due_date).unix() - dayjs(b.due_date).unix();
      },
      render: (_: unknown, record: TaskRow) => {
        const { label, color } = getDueDateDisplay(record);
        const od = isOverdue(record);
        return (
          <Tooltip title={record.due_date ? dayjs(record.due_date).format("DD MMM YYYY, hh:mm A") : undefined}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: od ? 600 : 400, color,
              background: od ? "#fef2f2" : "transparent",
              padding: od ? "2px 7px" : "0",
              borderRadius: od ? 6 : 0,
              border: od ? "1px solid #fecaca" : "none",
            }}>
              {od ? <AlertOutlined style={{ fontSize: 11 }} /> : <CalendarOutlined style={{ fontSize: 10, color: "#d1d5db" }} />}
              {label}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: "Assigned To",
      dataIndex: "assigned_name",
      key: "assigned_name",
      width: 150,
      ellipsis: true,
      render: (v: string | null) =>
        v ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#eff6ff", border: "1px solid #bfdbfe", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <UserOutlined style={{ fontSize: 10, color: "#4338ca" }} />
            </span>
            <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
          </span>
        ) : <Text type="secondary" style={{ fontSize: 12 }}>Unassigned</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 148,
      render: (_: unknown, record: TaskRow) => {
        return (
          <Select
            value={record.status}
            size="small"
            style={{ width: 138 }}
            onChange={(v) => handleQuickStatus(record.id, v)}
            disabled={!isManagerOrAdmin && record.assigned_to !== currentUserId}
            options={[
              { value: "pending",     label: "Pending"     },
              { value: "in_progress", label: "In Progress" },
              { value: "completed",   label: "Completed"   },
            ]}
          />
        );
      },
    },
    {
      title: "",
      key: "actions",
      fixed: "right" as const,
      width: 76,
      render: (_: unknown, record: TaskRow) => {
        const canEdit =
          isManagerOrAdmin ||
          record.assigned_to === currentUserId ||
          record.created_by === currentUserId;
        const canDelete =
          isAdmin ||
          isManagerOrAdmin ||
          record.created_by === currentUserId;

        return (
          <Space size={2}>
            {canEdit && (
              <Tooltip title="Edit">
                <Button
                  type="text" size="small" icon={<EditOutlined />}
                  style={{ color: "#9ca3af" }} onClick={() => openEdit(record)}
                />
              </Tooltip>
            )}
            {canDelete && (
              <Popconfirm
                title="Delete this task?"
                description="This cannot be undone."
                onConfirm={() => handleDelete(record.id)}
                okText="Delete" okButtonProps={{ danger: true }}
                cancelText="Cancel"
              >
                <Tooltip title="Delete">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Inject row styles for overdue + priority borders */}
      <style>{`
        .task-row-overdue td { background: #fff8f8 !important; }
        .task-row-overdue:hover td { background: #fff1f1 !important; }
        .task-row-high td:first-child { border-left: 3px solid #ef4444; }
        .task-row-medium td:first-child { border-left: 3px solid #f59e0b; }
        .task-row-low td:first-child { border-left: 3px solid #16a34a; }
      `}</style>

      <div style={{ padding: "0 4px" }}>

        {/* ── Page Header ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <Title level={2} style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Tasks</Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              Manage follow-ups, reminders, and action items across leads, deals & contacts.
            </Text>
          </div>
          <Button
            type="primary" icon={<PlusOutlined />} size="large"
            style={{ borderRadius: 10, fontWeight: 600 }}
            onClick={() => { setEditingId(null); setDrawerOpen(true); }}
          >
            New Task
          </Button>
        </div>

        {/* ── Stat Cards ──────────────────────────────────────────────── */}
        <Row gutter={[14, 14]} style={{ marginBottom: 20 }}>
          <Col xs={12} sm={8} lg={24 / 5}>
            <StatCard label="Total" count={stats.total} icon={<AppstoreOutlined />}
              color="#4f46e5" bg="#eff6ff" active={!statusFilter}
              onClick={clearFilters} />
          </Col>
          <Col xs={12} sm={8} lg={24 / 5}>
            <StatCard label="Pending" count={stats.pending} icon={<ClockCircleOutlined />}
              color="#6b7280" bg="#f9fafb" active={statusFilter === "pending"}
              onClick={() => setStatusFilter(statusFilter === "pending" ? undefined : "pending")} />
          </Col>
          <Col xs={12} sm={8} lg={24 / 5}>
            <StatCard label="In Progress" count={stats.in_progress} icon={<AppstoreOutlined />}
              color="#4338ca" bg="#eff6ff" active={statusFilter === "in_progress"}
              onClick={() => setStatusFilter(statusFilter === "in_progress" ? undefined : "in_progress")} />
          </Col>
          <Col xs={12} sm={8} lg={24 / 5}>
            <StatCard label="Overdue" count={stats.overdue} icon={<AlertOutlined />}
              color="#b91c1c" bg="#fef2f2" active={statusFilter === "overdue"}
              onClick={() => setStatusFilter(statusFilter === "overdue" ? undefined : "overdue")} />
          </Col>
          <Col xs={12} sm={8} lg={24 / 5}>
            <StatCard label="Completed" count={stats.completed} icon={<CheckCircleOutlined />}
              color="#16a34a" bg="#f0fdf4" active={statusFilter === "completed"}
              onClick={() => setStatusFilter(statusFilter === "completed" ? undefined : "completed")} />
          </Col>
        </Row>

        {/* ── Filter Bar ──────────────────────────────────────────────── */}
        <Card
          style={{ borderRadius: 14, border: "1.5px solid #f0f0f0", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          styles={{ body: { padding: 16 } }}
        >
          <Row gutter={[12, 12]}>
            <Col xs={24} md={10} lg={9}>
              <Input
                allowClear
                placeholder="Search title, notes, related record…"
                prefix={<SearchOutlined style={{ color: "#d1d5db" }} />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ borderRadius: 8 }}
              />
            </Col>
            <Col xs={12} md={5} lg={4}>
              <Select
                allowClear placeholder="Priority"
                style={{ width: "100%" }} value={priorityFilter}
                onChange={setPriorityFilter}
                options={[
                  { value: "high",   label: "🔴 High"   },
                  { value: "medium", label: "🟡 Medium" },
                  { value: "low",    label: "🟢 Low"    },
                ]}
              />
            </Col>
            <Col xs={12} md={5} lg={4}>
              <Select
                allowClear placeholder="Status"
                style={{ width: "100%" }} value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "pending",     label: "Pending"     },
                  { value: "in_progress", label: "In Progress" },
                  { value: "completed",   label: "Completed"   },
                  { value: "overdue",     label: "⚠️ Overdue"  },
                ]}
              />
            </Col>
            <Col xs={24} md={24} lg={7}>
              <RangePicker
                style={{ width: "100%" }}
                value={dateRange as any}
                onChange={(v) => setDateRange(v ? [v[0]!, v[1]!] : null)}
                allowClear
                placeholder={["Due from", "Due to"]}
              />
            </Col>
          </Row>

          {(isManagerOrAdmin || hasFilters) && (
            <Row gutter={[12, 8]} style={{ marginTop: 10 }} align="middle">
              {isManagerOrAdmin && (
                <Col xs={24} sm={10} md={8} lg={6}>
                  <Select
                    allowClear showSearch optionFilterProp="label"
                    placeholder="Filter by assignee"
                    style={{ width: "100%" }} value={assigneeFilter}
                    onChange={setAssigneeFilter}
                    options={members.map((m) => ({ value: m.id, label: m.label }))}
                  />
                </Col>
              )}
              <Col flex="auto">
                {hasFilters && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Showing <strong>{filtered.length}</strong> of <strong>{tasks.length}</strong> tasks
                  </Text>
                )}
              </Col>
              {hasFilters && (
                <Col>
                  <Button size="small" type="link" onClick={clearFilters}
                    style={{ padding: 0, fontSize: 12, color: "#9ca3af" }}>
                    Clear all
                  </Button>
                </Col>
              )}
            </Row>
          )}
        </Card>

        {/* ── Task Table ──────────────────────────────────────────────── */}
        <Card
          style={{ borderRadius: 14, border: "1.5px solid #f0f0f0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          styles={{ body: { padding: 0 } }}
        >
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            loading={loading}
            size="middle"
            scroll={{ x: 900 }}
            pagination={{
              defaultPageSize: 15,
              showSizeChanger: true,
              showTotal: (t) => `${t} tasks`,
              style: { padding: "12px 16px", margin: 0 },
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div style={{ paddingTop: 8 }}>
                      <Text strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>
                        {hasFilters ? "No tasks match your filters" : "No tasks yet"}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {hasFilters
                          ? "Try adjusting the filters or clear them."
                          : "Create your first task to get started."}
                      </Text>
                    </div>
                  }
                >
                  {!hasFilters && (
                    <Button type="primary" icon={<PlusOutlined />}
                      onClick={() => setDrawerOpen(true)} style={{ borderRadius: 8 }}>
                      Create First Task
                    </Button>
                  )}
                </Empty>
              ),
            }}
            rowClassName={(record) => {
              if (isOverdue(record)) return `task-row-overdue task-row-${record.priority}`;
              return `task-row-${record.priority}`;
            }}
          />
        </Card>

        {/* ── Create / Edit Drawer ─────────────────────────────────────── */}
        <Drawer
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: "#eff6ff",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#4338ca", fontSize: 15,
              }}>
                {editingId ? <EditOutlined /> : <PlusOutlined />}
              </div>
              <span>{editingId ? "Edit Task" : "New Task"}</span>
            </div>
          }
          placement="right"
          width={480}
          open={drawerOpen}
          onClose={closeDrawer}
          destroyOnClose
          extra={
            <Space>
              <Button onClick={closeDrawer}>Cancel</Button>
              <Button type="primary" onClick={submit} style={{ borderRadius: 8 }}>
                {editingId ? "Save changes" : "Create task"}
              </Button>
            </Space>
          }
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{ priority: "medium", status: "pending", related_type: undefined }}
            onValuesChange={(changed) => {
              if (changed.related_type !== undefined) {
                form.setFieldValue("related_id", undefined);
              }
            }}
          >
            <Form.Item
              name="title"
              label="Task Title"
              rules={[{ required: true, message: "Title is required" }]}
            >
              <Input placeholder="e.g. Follow up with Acme Corp" autoFocus />
            </Form.Item>

            <Form.Item name="description" label="Description">
              <Input.TextArea
                rows={3}
                placeholder="Additional notes or context…"
                style={{ resize: "vertical" }}
              />
            </Form.Item>

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="priority"
                  label="Priority"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      { value: "high",   label: "🔴 High"   },
                      { value: "medium", label: "🟡 Medium" },
                      { value: "low",    label: "🟢 Low"    },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="status"
                  label="Status"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      { value: "pending",     label: "Pending"     },
                      { value: "in_progress", label: "In Progress" },
                      { value: "completed",   label: "Completed"   },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="due_date"
              label="Due Date"
              rules={[{ required: true, message: "Please set a due date" }]}
            >
              <DatePicker
                showTime
                style={{ width: "100%" }}
                format="DD MMM YYYY, hh:mm A"
                placeholder="Select due date & time"
                disabledDate={(d) => d && d.isBefore(dayjs().startOf("day"))}
              />
            </Form.Item>

            {isManagerOrAdmin && (
              <Form.Item name="assigned_to" label="Assign To">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select team member"
                  options={members.map((m) => ({ value: m.id, label: m.label }))}
                />
              </Form.Item>
            )}

            <Row gutter={12}>
              <Col span={10}>
                <Form.Item name="related_type" label="Related To">
                  <Select
                    allowClear
                    placeholder="Type"
                    options={[
                      { value: "lead",    label: "Lead"    },
                      { value: "contact", label: "Contact" },
                      { value: "deal",    label: "Deal"    },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={14}>
                <Form.Item name="related_id" label=" ">
                  <Select
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    placeholder="Select record"
                    disabled={!watchedRelatedType}
                    notFoundContent={
                      <Text type="secondary" style={{ fontSize: 12 }}>No records found</Text>
                    }
                    options={relatedOptions.map((x) => ({ value: x.id, label: x.label }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Drawer>
      </div>
    </>
  );
}
