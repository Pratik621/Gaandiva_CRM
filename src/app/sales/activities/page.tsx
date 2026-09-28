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
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  PhoneOutlined,
  TeamOutlined,
  MailOutlined,
  PlayCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
  UserOutlined,
  LinkOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";

dayjs.extend(relativeTime);

// ─── Types ────────────────────────────────────────────────────────────────────
type ActivityRow = {
  id: string;
  activity_type: "call" | "meeting" | "email" | "demo";
  related_to_type: "lead" | "contact" | "deal";
  related_to_id: string;
  related_to_name: string | null;
  notes: string | null;
  activity_date: string;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
};

type LookupItem = { id: string; label: string };

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

// ─── Config ───────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode; dot: string }
> = {
  call:    { label: "Call",    color: "#4338ca", bg: "#eff6ff", border: "#bfdbfe", icon: <PhoneOutlined />,       dot: "#6366f1" },
  meeting: { label: "Meeting", color: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe", icon: <TeamOutlined />,        dot: "#8b5cf6" },
  email:   { label: "Email",   color: "#0e7490", bg: "#ecfeff", border: "#a5f3fc", icon: <MailOutlined />,        dot: "#06b6d4" },
  demo:    { label: "Demo",    color: "#b45309", bg: "#fffbeb", border: "#fde68a", icon: <PlayCircleOutlined />,  dot: "#f59e0b" },
};

const RELATED_COLORS: Record<string, string> = {
  lead:    "#6366f1",
  contact: "#10b981",
  deal:    "#f59e0b",
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  type, count, active, onClick,
}: {
  type: string; count: number; active: boolean; onClick: () => void;
}) {
  const cfg = TYPE_CONFIG[type];
  return (
    <Card
      onClick={onClick}
      hoverable
      style={{
        borderRadius: 14,
        border: active ? `2px solid ${cfg.dot}` : "1.5px solid #f0f0f0",
        background: active ? cfg.bg : "#fff",
        cursor: "pointer",
        transition: "all 0.18s",
        boxShadow: active ? `0 4px 16px ${cfg.dot}22` : "0 1px 4px rgba(0,0,0,0.05)",
      }}
      styles={{ body: { padding: "14px 18px" } }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            {cfg.label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: active ? cfg.color : "#111827", lineHeight: 1 }}>
            {count}
          </div>
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: active ? cfg.dot : "#f3f4f6",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: active ? "#fff" : "#9ca3af", fontSize: 16,
          transition: "all 0.18s",
        }}>
          {cfg.icon}
        </div>
      </div>
    </Card>
  );
}

// ─── Timeline Item ────────────────────────────────────────────────────────────
function TimelineItem({
  activity, isManager, currentUserId, onEdit, onDelete,
}: {
  activity: ActivityRow;
  isManager: boolean;
  currentUserId: string;
  onEdit: (a: ActivityRow) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[activity.activity_type] ?? TYPE_CONFIG.call;
  const relColor = RELATED_COLORS[activity.related_to_type] ?? "#6b7280";
  const canEdit = isManager || activity.owner_id === currentUserId;

  return (
    <div style={{
      display: "flex",
      gap: 0,
      alignItems: "flex-start",
      marginBottom: 10,
      width: "100%",
    }}>
      {/* Left: icon + vertical line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 48, flexShrink: 0, paddingTop: 2 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: cfg.bg, border: `1.5px solid ${cfg.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: cfg.color, fontSize: 15,
        }}>
          {cfg.icon}
        </div>
        <div style={{ flex: 1, width: 2, background: "#f0f0f0", marginTop: 6, minHeight: 12 }} />
      </div>

      {/* Right: full-width card */}
      <div style={{
        flex: 1,
        minWidth: 0,
        background: "#fff",
        border: "1.5px solid #f3f4f6",
        borderRadius: 12,
        padding: "12px 16px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        {/* ── Header row ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>

          {/* Left: type badge + record name */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, flexShrink: 0,
              background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
              textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: "20px",
            }}>
              {cfg.label}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: "#111827", minWidth: 0 }}>
              <LinkOutlined style={{ color: relColor, fontSize: 11, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activity.related_to_name || `${activity.related_to_type} #${activity.related_to_id.slice(0, 6)}`}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, flexShrink: 0,
                background: `${relColor}18`, color: relColor, textTransform: "capitalize",
                lineHeight: "16px",
              }}>
                {activity.related_to_type}
              </span>
            </span>
          </div>

          {/* Right: relative time + actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Tooltip title={dayjs(activity.activity_date).format("DD MMM YYYY, hh:mm A")}>
              <span style={{ fontSize: 12, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4, cursor: "default" }}>
                <ClockCircleOutlined style={{ fontSize: 11 }} />
                {dayjs(activity.activity_date).fromNow()}
              </span>
            </Tooltip>
            {canEdit && (
              <Space size={0}>
                <Tooltip title="Edit">
                  <Button
                    type="text" size="small" icon={<EditOutlined />}
                    style={{ color: "#9ca3af" }} onClick={() => onEdit(activity)}
                  />
                </Tooltip>
                <Popconfirm
                  title="Delete this activity?"
                  description="This action cannot be undone."
                  onConfirm={() => onDelete(activity.id)}
                  okText="Delete" okButtonProps={{ danger: true }}
                  cancelText="Cancel"
                >
                  <Tooltip title="Delete">
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            )}
          </div>
        </div>

        {/* ── Notes ── */}
        {activity.notes && (
          <Paragraph
            style={{ margin: "10px 0 8px", fontSize: 13, color: "#374151", lineHeight: 1.65 }}
            ellipsis={{ rows: 3, expandable: true, symbol: "more" }}
          >
            {activity.notes}
          </Paragraph>
        )}

        {/* ── Footer meta ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: activity.notes ? 4 : 10, flexWrap: "wrap" }}>
          {activity.owner_name && (
            <span style={{ fontSize: 11.5, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}>
              <UserOutlined style={{ fontSize: 10 }} />
              {activity.owner_name}
            </span>
          )}
          <span style={{ fontSize: 11.5, color: "#d1d5db", display: "flex", alignItems: "center", gap: 4 }}>
            <CalendarOutlined style={{ fontSize: 10 }} />
            {dayjs(activity.activity_date).format("DD MMM YYYY, hh:mm A")}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SalesActivitiesPage() {
  const { user, roles } = useAuth();
  const currentUserId = user?.id ?? "";
  const isManager = roles.some((r) =>
    ["sales_manager", "admin"].includes(r.role_name.toLowerCase().replace(/\s+/g, "_"))
  );

  const [activities, setActivities]   = useState<ActivityRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);

  // Filters
  const [search,        setSearch]        = useState("");
  const [typeFilter,    setTypeFilter]    = useState<string | undefined>();
  const [relatedFilter, setRelatedFilter] = useState<string | undefined>();
  const [dateRange,     setDateRange]     = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [ownerFilter,   setOwnerFilter]   = useState<string | undefined>();

  // Lookups
  const [leads,    setLeads]    = useState<LookupItem[]>([]);
  const [contacts, setContacts] = useState<LookupItem[]>([]);
  const [deals,    setDeals]    = useState<LookupItem[]>([]);
  const [owners,   setOwners]   = useState<LookupItem[]>([]);

  const [form] = Form.useForm();
  const relatedType = Form.useWatch("related_to_type", form);

  // ── Fetch activities ────────────────────────────────────────────────────────
  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/sales/activities", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load activities");
      setActivities(json.activities ?? []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load activities");
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

      if (lr.ok) setLeads((lj.leads    ?? []).map((l: any) => ({ id: l.id, label: l.lead_name    || "Unnamed lead"    })));
      if (cr.ok) setContacts((cj.contacts ?? []).map((c: any) => ({ id: c.id, label: c.contact_name || "Unnamed contact" })));
      if (dr.ok) setDeals((dj.deals    ?? []).map((d: any) => ({ id: d.id, label: d.deal_name    || "Unnamed deal"    })));

      // Collect distinct owners from activities (manager only)
      if (isManager) {
        const res  = await fetch("/api/sales/activities", { credentials: "include" });
        const json = await res.json();
        const seen = new Map<string, string>();
        ((json.activities ?? []) as ActivityRow[]).forEach((a) => {
          if (a.owner_id && a.owner_name && !seen.has(a.owner_id)) {
            seen.set(a.owner_id, a.owner_name);
          }
        });
        setOwners(Array.from(seen.entries()).map(([id, label]) => ({ id, label })));
      }
    } catch { /* silent */ }
  }, [isManager]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);
  useEffect(() => { fetchLookups(); },   [fetchLookups]);

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((a) => {
      if (typeFilter    && a.activity_type    !== typeFilter)    return false;
      if (relatedFilter && a.related_to_type  !== relatedFilter) return false;
      if (ownerFilter   && a.owner_id         !== ownerFilter)   return false;
      if (dateRange) {
        const d = dayjs(a.activity_date);
        if (d.isBefore(dateRange[0], "day") || d.isAfter(dateRange[1], "day")) return false;
      }
      if (q) {
        return (
          (a.notes            ?? "").toLowerCase().includes(q) ||
          (a.owner_name       ?? "").toLowerCase().includes(q) ||
          (a.related_to_name  ?? "").toLowerCase().includes(q) ||
          a.activity_type.toLowerCase().includes(q) ||
          a.related_to_type.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activities, search, typeFilter, relatedFilter, ownerFilter, dateRange]);

  // ── Stat counts ─────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const m: Record<string, number> = { call: 0, meeting: 0, email: 0, demo: 0 };
    filtered.forEach((a) => { m[a.activity_type] = (m[a.activity_type] ?? 0) + 1; });
    return m;
  }, [filtered]);

  // ── Related options for form ─────────────────────────────────────────────────
  const relatedOptions = useMemo(() => {
    if (relatedType === "lead")    return leads;
    if (relatedType === "contact") return contacts;
    if (relatedType === "deal")    return deals;
    return [];
  }, [relatedType, leads, contacts, deals]);

  // ── Submit (create / edit) ──────────────────────────────────────────────────
  const submit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        activity_type:    values.activity_type,
        related_to_type:  values.related_to_type,
        related_to_id:    values.related_to_id,
        notes:            values.notes || null,
        activity_date:    values.activity_date
          ? dayjs(values.activity_date).toISOString()
          : new Date().toISOString(),
      };

      if (editingId) {
        const res  = await fetch(`/api/sales/activities/${editingId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          credentials: "include", body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to update");
        message.success("Activity updated");
      } else {
        const res  = await fetch("/api/sales/activities", {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include", body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to create");
        message.success("Activity logged");
      }

      closeDrawer();
      fetchActivities();
      if (isManager) fetchLookups();
    } catch (err) {
      if (err instanceof Error && err.message) message.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res  = await fetch(`/api/sales/activities/${id}`, {
        method: "DELETE", credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");
      message.success("Activity deleted");
      fetchActivities();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  };

  const openEditDrawer = (a: ActivityRow) => {
    setEditingId(a.id);
    form.setFieldsValue({
      activity_type:   a.activity_type,
      related_to_type: a.related_to_type,
      related_to_id:   a.related_to_id,
      notes:           a.notes ?? "",
      activity_date:   dayjs(a.activity_date),
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    form.resetFields();
  };

  const clearFilters = () => {
    setSearch(""); setTypeFilter(undefined);
    setRelatedFilter(undefined); setDateRange(null); setOwnerFilter(undefined);
  };

  const hasActiveFilters = !!(search || typeFilter || relatedFilter || dateRange || ownerFilter);

  // ── Group by date ───────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    filtered.forEach((a) => {
      const key = dayjs(a.activity_date).format("YYYY-MM-DD");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "0 4px" }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <Title level={2} style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Activities</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            Track all sales interactions — calls, meetings, emails & demos.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large"
          style={{ borderRadius: 10, fontWeight: 600 }}
          onClick={() => { setEditingId(null); setDrawerOpen(true); }}
        >
          Log Activity
        </Button>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <Row gutter={[14, 14]} style={{ marginBottom: 20 }}>
        {(["call", "meeting", "email", "demo"] as const).map((t) => (
          <Col xs={12} sm={6} key={t}>
            <StatCard
              type={t} count={counts[t] ?? 0}
              active={typeFilter === t}
              onClick={() => setTypeFilter(typeFilter === t ? undefined : t)}
            />
          </Col>
        ))}
      </Row>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <Card
        style={{ borderRadius: 14, border: "1.5px solid #f0f0f0", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        styles={{ body: { padding: 16 } }}
      >
        {/* Row 1 – main filters always sum to 24 */}
        <Row gutter={[12, 12]}>
          <Col xs={24} md={10} lg={9}>
            <Input
              allowClear
              placeholder="Search notes, name, owner…"
              prefix={<SearchOutlined style={{ color: "#d1d5db" }} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ borderRadius: 8 }}
            />
          </Col>
          <Col xs={12} md={5} lg={4}>
            <Select
              allowClear
              placeholder="Activity type"
              style={{ width: "100%" }}
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "call",    label: "📞 Call"    },
                { value: "meeting", label: "👥 Meeting" },
                { value: "email",   label: "✉️ Email"   },
                { value: "demo",    label: "🎬 Demo"    },
              ]}
            />
          </Col>
          <Col xs={12} md={5} lg={4}>
            <Select
              allowClear
              placeholder="Related to"
              style={{ width: "100%" }}
              value={relatedFilter}
              onChange={setRelatedFilter}
              options={[
                { value: "lead",    label: "Lead"    },
                { value: "contact", label: "Contact" },
                { value: "deal",    label: "Deal"    },
              ]}
            />
          </Col>
          <Col xs={24} md={24} lg={7}>
            <RangePicker
              style={{ width: "100%" }}
              value={dateRange as any}
              onChange={(v) => setDateRange(v ? [v[0]!, v[1]!] : null)}
              allowClear
              placeholder={["From date", "To date"]}
            />
          </Col>
        </Row>

        {/* Row 2 – owner filter (manager) + result summary + clear */}
        {(isManager || hasActiveFilters) && (
          <Row gutter={[12, 8]} style={{ marginTop: 10 }} align="middle">
            {isManager && (
              <Col xs={24} sm={10} md={8} lg={6}>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Filter by owner"
                  style={{ width: "100%" }}
                  value={ownerFilter}
                  onChange={setOwnerFilter}
                  options={owners.map((o) => ({ value: o.id, label: o.label }))}
                />
              </Col>
            )}
            <Col flex="auto">
              {hasActiveFilters && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Showing <strong>{filtered.length}</strong> of <strong>{activities.length}</strong> activities
                </Text>
              )}
            </Col>
            {hasActiveFilters && (
              <Col>
                <Button
                  size="small"
                  type="link"
                  onClick={clearFilters}
                  style={{ padding: 0, fontSize: 12, color: "#9ca3af" }}
                >
                  Clear all
                </Button>
              </Col>
            )}
          </Row>
        )}
      </Card>

      {/* ── Timeline body ────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 64 }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: "#9ca3af", fontSize: 14 }}>Loading activities…</div>
        </div>
      ) : filtered.length === 0 ? (
        <Card style={{ borderRadius: 14, border: "1.5px solid #f0f0f0", textAlign: "center", padding: "48px 0" }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <Text strong style={{ fontSize: 15, display: "block", marginBottom: 4 }}>
                  {hasActiveFilters ? "No activities match your filters" : "No activities yet"}
                </Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {hasActiveFilters
                    ? "Try adjusting the filters or clear them to see all activities."
                    : "Start by logging a call, meeting, email or demo."}
                </Text>
              </div>
            }
          >
            {!hasActiveFilters && (
              <Button type="primary" icon={<PlusOutlined />}
                onClick={() => setDrawerOpen(true)} style={{ borderRadius: 8 }}>
                Log First Activity
              </Button>
            )}
          </Empty>
        </Card>
      ) : (
        <Card
          style={{ borderRadius: 14, border: "1.5px solid #f0f0f0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          styles={{ body: { padding: "16px 20px" } }}
        >
          {grouped.map(([dateKey, items], groupIdx) => (
            <div key={dateKey} style={{ marginBottom: groupIdx < grouped.length - 1 ? 24 : 0 }}>
              {/* Date group header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#6b7280",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                }}>
                  <CalendarOutlined style={{ fontSize: 10 }} />
                  {dayjs(dateKey).isSame(dayjs(), "day")
                    ? "Today"
                    : dayjs(dateKey).isSame(dayjs().subtract(1, "day"), "day")
                      ? "Yesterday"
                      : dayjs(dateKey).format("dddd, DD MMM YYYY")}
                </span>
                <div style={{ flex: 1, height: 1, background: "#f3f4f6" }} />
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "#9ca3af",
                  background: "#f9fafb", border: "1px solid #e5e7eb",
                  borderRadius: 10, padding: "1px 8px", flexShrink: 0,
                }}>
                  {items.length}
                </span>
              </div>

              {/* Timeline items */}
              {items.map((a) => (
                <TimelineItem
                  key={a.id}
                  activity={a}
                  isManager={isManager}
                  currentUserId={currentUserId}
                  onEdit={openEditDrawer}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ))}
        </Card>
      )}

      {/* ── Log / Edit Drawer ─────────────────────────────────────────────── */}
      <Drawer
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#4338ca", fontSize: 15 }}>
              {editingId ? <EditOutlined /> : <PlusOutlined />}
            </div>
            <span>{editingId ? "Edit Activity" : "Log New Activity"}</span>
          </div>
        }
        placement="right"
        width={460}
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={closeDrawer}>Cancel</Button>
            <Button type="primary" onClick={submit} style={{ borderRadius: 8 }}>
              {editingId ? "Save changes" : "Log activity"}
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ activity_type: "call", related_to_type: "lead" }}
          onValuesChange={(changed) => {
            if (changed.related_to_type) form.setFieldValue("related_to_id", undefined);
          }}
        >
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="activity_type" label="Activity Type" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "call",    label: "📞 Call"    },
                    { value: "meeting", label: "👥 Meeting" },
                    { value: "email",   label: "✉️ Email"   },
                    { value: "demo",    label: "🎬 Demo"    },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="related_to_type" label="Related To" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "lead",    label: "Lead"    },
                    { value: "contact", label: "Contact" },
                    { value: "deal",    label: "Deal"    },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="related_to_id" label="Select Record" rules={[{ required: true, message: "Please select a record" }]}>
            <Select
              showSearch
              placeholder="Choose related record"
              optionFilterProp="label"
              notFoundContent={<Text type="secondary" style={{ fontSize: 12 }}>No records found</Text>}
              options={relatedOptions.map((x) => ({ value: x.id, label: x.label }))}
            />
          </Form.Item>

          <Form.Item name="activity_date" label="Activity Date & Time">
            <DatePicker
              showTime
              style={{ width: "100%" }}
              placeholder="Now (leave blank)"
              format="DD MMM YYYY, hh:mm A"
            />
          </Form.Item>

          <Form.Item name="notes" label="Notes">
            <Input.TextArea
              rows={5}
              placeholder="What happened? Outcomes, next steps, objections…"
              style={{ resize: "vertical" }}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
