"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  DatePicker,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  SearchOutlined,
  MailOutlined,
  EditOutlined,
  ArrowRightOutlined,
  StarOutlined,
  DeleteOutlined,
  CloseOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { NewDealDrawer } from "@/components/Sales/NewDealDrawer";
import { encodeDealAssociate } from "@/lib/sales/dealAssociate";

// ─── Types ────────────────────────────────────────────────────────────────────

type LineItem = { name: string; quantity: number; amount: number };

type DealRow = {
  id: string;
  deal_name: string;
  account_id: string | null;
  account_name: string | null;
  contact_id: string | null;
  sales_lead_id: string | null;
  contact_name: string | null;
  value: number | null;
  stage: string;
  pipeline: string | null;
  deal_type: string | null;
  priority: string | null;
  line_items: LineItem[] | null;
  owner_id: string | null;
  owner_name: string | null;
  expected_close_date: string | null;
  created_at: string;
};

const { Title, Text } = Typography;

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  { value: "introductory_meeting",  label: "Introductory meeting",  color: "#0d9488", probability: 20  },
  { value: "campaign_assessment",   label: "Campaign assessment",   color: "#0891b2", probability: 35  },
  { value: "strategy_proposal",     label: "Strategy proposal",     color: "#7c3aed", probability: 50  },
  { value: "strategy_presentation", label: "Strategy presentation", color: "#db2777", probability: 65  },
  { value: "objection_handling",    label: "Objection handling",    color: "#ea580c", probability: 75  },
  { value: "finalizing_terms",      label: "Finalizing terms",      color: "#f59e0b", probability: 90  },
  { value: "closed_won",            label: "Closed won",            color: "#16a34a", probability: 100 },
  { value: "closed_lost",           label: "Closed lost",           color: "#ef4444", probability: 0   },
] as const;

const PIPELINES   = ["Client Acquisition pipeline", "Renewal pipeline", "Upsell pipeline"];
const DEAL_TYPES  = ["New business", "Existing business", "Partner deal", "Renewal"];
const PRIORITIES  = [
  { value: "low",    label: "Low",    color: "#6b7280" },
  { value: "medium", label: "Medium", color: "#f59e0b" },
  { value: "high",   label: "High",   color: "#ef4444" },
];

const stageColor = (v: string) => STAGES.find((s) => s.value === v)?.color ?? "#6b7280";

// ─── Deal card (static, used in overlay too) ─────────────────────────────────

function DealCard({
  deal,
  onStageChange,
  isSelected,
  onToggleSelect,
  onEdit,
}: {
  deal: DealRow;
  onStageChange: (id: string, stage: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onEdit?: (deal: DealRow) => void;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const accent = stageColor(deal.stage);
  const showCheckbox = hovered || isSelected;

  return (
    <div
      style={{
        background: isSelected ? `${accent}0d` : "#fff",
        border: isSelected ? `1.5px solid ${accent}` : "1px solid #e5e7eb",
        borderRadius: 10,
        borderLeft: `4px solid ${accent}`,
        padding: "12px 12px 10px",
        boxShadow: isSelected
          ? `0 0 0 2px ${accent}30`
          : "0 1px 4px rgba(0,0,0,0.06)",
        marginBottom: 10,
        userSelect: "none",
        position: "relative",
        transition: "box-shadow 0.15s, border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hover / selected checkbox */}
      {onToggleSelect && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            opacity: showCheckbox ? 1 : 0,
            transition: "opacity 0.15s",
            zIndex: 10,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(deal.id);
          }}
        >
          <Checkbox checked={!!isSelected} />
        </div>
      )}

      {/* Deal name */}
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: accent,
          marginBottom: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: "underline",
          textDecorationColor: `${accent}55`,
          cursor: "pointer",
          paddingRight: showCheckbox ? 26 : 0,
          transition: "padding-right 0.15s",
        }}
        title={deal.deal_name}
      >
        {deal.deal_name}
      </div>

      {/* Meta — including clickable contact name at top */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#374151" }}>
          <span style={{ color: "#6b7280" }}>Amount: </span>
          <span style={{ fontWeight: 600 }}>
            {deal.value != null ? `$${Number(deal.value).toLocaleString()}` : "—"}
          </span>
        </div>
        {deal.expected_close_date && (
          <div style={{ fontSize: 12, color: "#374151" }}>
            <span style={{ color: "#6b7280" }}>Close date: </span>
            {dayjs(deal.expected_close_date).format("MM/DD/YYYY")}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#374151" }}>
          <span style={{ color: "#6b7280" }}>Create date: </span>
          {dayjs(deal.created_at).format("MM/DD/YYYY")}
        </div>
        {deal.priority && (
          <div style={{ fontSize: 12, color: "#374151" }}>
            <span style={{ color: "#6b7280" }}>Priority: </span>
            <Tag
              color={PRIORITIES.find((p) => p.value === deal.priority)?.color}
              style={{ fontSize: 10, padding: "0 5px", margin: 0 }}
            >
              {deal.priority.toUpperCase()}
            </Tag>
          </div>
        )}

        {/* Contact name — clickable, shown in meta (top) */}
        {deal.contact_name && (
          <div
            style={{ fontSize: 12, color: "#374151", display: "flex", alignItems: "center", gap: 4 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span style={{ color: "#6b7280" }}>Contact: </span>
            <Tooltip title="Open contact">
              <span
                style={{
                  color: accent,
                  fontWeight: 500,
                  cursor: "pointer",
                  textDecoration: "underline",
                  textDecorationColor: `${accent}55`,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 130,
                  display: "inline-block",
                  verticalAlign: "bottom",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/sales/contacts${deal.contact_id ? `?highlight=${deal.contact_id}` : ""}`);
                }}
              >
                {deal.contact_name}
              </span>
            </Tooltip>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid #f3f4f6", marginBottom: 10 }} />

      {/* Company row — clickable, shown below divider */}
      {deal.account_name && (
        <div
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Tooltip title="Open company">
            <div
              style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/sales/accounts${deal.account_id ? `?highlight=${deal.account_id}` : ""}`);
              }}
            >
              <div
                style={{
                  width: 22, height: 22, borderRadius: 4, background: "#e5e7eb",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: 10, fontWeight: 700, color: "#374151",
                }}
              >
                {deal.account_name[0].toUpperCase()}
              </div>
              <span
                style={{
                  fontSize: 12, color: "#374151", fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: 160,
                  textDecoration: "underline", textDecorationColor: "#d1d5db",
                }}
              >
                {deal.account_name}
              </span>
            </div>
          </Tooltip>
        </div>
      )}

      {/* Action icons */}
      <div
        style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Tooltip title="Move to next stage">
          <ArrowRightOutlined
            style={{ color: "#9ca3af", fontSize: 13, cursor: "pointer" }}
            onClick={() => {
              const idx = STAGES.findIndex((s) => s.value === deal.stage);
              if (idx < STAGES.length - 1) onStageChange(deal.id, STAGES[idx + 1].value);
            }}
          />
        </Tooltip>
        <Tooltip title="AI insights">
          <StarOutlined style={{ color: "#9ca3af", fontSize: 13, cursor: "pointer" }} />
        </Tooltip>
        <Tooltip title="Send email">
          <MailOutlined style={{ color: "#9ca3af", fontSize: 13, cursor: "pointer" }} />
        </Tooltip>
        <Tooltip title="Edit this deal">
          <EditOutlined
            style={{ color: onEdit ? "#0d9488" : "#9ca3af", fontSize: 13, cursor: onEdit ? "pointer" : "default" }}
            onClick={() => onEdit?.(deal)}
          />
        </Tooltip>
      </div>
    </div>
  );
}

// ─── Draggable wrapper ────────────────────────────────────────────────────────

function DraggableDealCard({
  deal,
  onStageChange,
  isSelected,
  onToggleSelect,
  onEdit,
}: {
  deal: DealRow;
  onStageChange: (id: string, stage: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (deal: DealRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      {...listeners}
      {...attributes}
    >
      <DealCard
        deal={deal}
        onStageChange={onStageChange}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        onEdit={onEdit}
      />
    </div>
  );
}

// ─── Droppable column ─────────────────────────────────────────────────────────

function DroppableColumn({
  stage,
  deals,
  onStageChange,
  selectedIds,
  onToggleSelect,
  onEdit,
}: {
  stage: (typeof STAGES)[number];
  deals: DealRow[];
  onStageChange: (id: string, stage: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEdit: (deal: DealRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.value });
  const totalValue    = deals.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const weightedValue = Math.round((totalValue * stage.probability) / 100);

  return (
    <div style={{ minWidth: 260, flex: "0 0 260px", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          background: "#fff",
          borderRadius: "10px 10px 0 0",
          border: "1px solid #e5e7eb",
          borderBottom: `3px solid ${stage.color}`,
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{stage.label}</span>
        <Badge count={deals.length} style={{ backgroundColor: stage.color, fontSize: 11 }} showZero />
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          minHeight: 80,
          background: isOver ? `${stage.color}10` : "#f9fafb",
          border: `1px solid ${isOver ? stage.color : "#e5e7eb"}`,
          borderTop: "none",
          borderBottom: "none",
          padding: "10px 10px 0",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {deals.length === 0 && !isOver ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 12 }}>
            Drop deals here
          </div>
        ) : (
          deals.map((d) => (
            <DraggableDealCard
              key={d.id}
              deal={d}
              onStageChange={onStageChange}
              isSelected={selectedIds.has(d.id)}
              onToggleSelect={onToggleSelect}
              onEdit={onEdit}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderTop: "1px solid #f3f4f6",
          borderRadius: "0 0 10px 10px",
          padding: "8px 14px",
        }}
      >
        <div style={{ fontSize: 12, color: "#374151" }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            ${Number(totalValue).toLocaleString()}
          </span>
          <span style={{ color: "#9ca3af", marginLeft: 4 }}>| Total amount</span>
        </div>
        {stage.probability > 0 && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
            <span style={{ fontWeight: 600, color: "#374151" }}>
              ${Number(weightedValue).toLocaleString()}
            </span>
            <span style={{ marginLeft: 2 }}>({stage.probability}%)</span>
            <span style={{ color: "#9ca3af", marginLeft: 4 }}>| Weighted amount</span>
            <Tooltip title="Weighted amount = Total × Win probability for this stage">
              <span
                style={{
                  marginLeft: 4, border: "1px solid #d1d5db", borderRadius: "50%",
                  width: 14, height: 14, display: "inline-flex", alignItems: "center",
                  justifyContent: "center", fontSize: 9, cursor: "help", color: "#9ca3af",
                }}
              >
                i
              </span>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SalesDealsPage() {
  const [view, setView]               = useState<"Pipeline" | "List">("Pipeline");
  const [deals, setDeals]             = useState<DealRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [search, setSearch]           = useState("");
  const [stageFilter, setStageFilter] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [accounts, setAccounts]       = useState<{ id: string; company_name: string | null }[]>([]);
  const [dealAssociateOptions, setDealAssociateOptions] = useState<{ value: string; label: string }[]>([]);
  const [users, setUsers]             = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name: string | null; email: string | null } | null>(null);
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [assignForm]     = Form.useForm();
  const [editForm]       = Form.useForm();
  const [dealEditForm]   = Form.useForm();

  // ── Edit single deal state ─────────────────────────────────────────────────
  const [editingDeal, setEditingDeal]         = useState<DealRow | null>(null);
  const [editDrawerOpen, setEditDrawerOpen]   = useState(false);

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen]     = useState(false);
  const [bulkWorking, setBulkWorking]         = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Data ───────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/sales/deals", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load deals");
      setDeals(json.deals ?? []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchLookups = useCallback(async () => {
    try {
      const [accRes, optRes, usrRes, profRes] = await Promise.all([
        fetch("/api/sales/accounts", { credentials: "include" }),
        fetch("/api/sales/deal-lead-options", { credentials: "include" }),
        fetch("/api/sales/deal-owners", { credentials: "include" }),
        fetch("/api/profile", { credentials: "include" }),
      ]);
      const accJson  = await accRes.json().catch(() => ({}));
      const optJson  = await optRes.json().catch(() => ({}));
      const usrJson  = await usrRes.json().catch(() => ({}));
      const profJson = await profRes.json().catch(() => ({}));

      if (accRes.ok)  setAccounts((accJson.accounts  ?? []).map((a: any) => ({ id: a.id, company_name: a.company_name ?? null })));
      if (optRes.ok)  setDealAssociateOptions((optJson.options ?? []) as { value: string; label: string }[]);
      if (usrRes.ok)  setUsers   ((usrJson.users       ?? []).map((u: any) => ({ id: u.id, full_name: u.full_name ?? null, email: u.email ?? null })));
      if (profRes.ok && profJson.id) {
        setCurrentUser({ id: profJson.id, full_name: profJson.full_name ?? null, email: profJson.email ?? null });
      }
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => { fetchLookups(); }, [fetchLookups]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => {
      const matchesSearch =
        !q ||
        d.deal_name.toLowerCase().includes(q) ||
        (d.account_name ?? "").toLowerCase().includes(q) ||
        (d.contact_name ?? "").toLowerCase().includes(q) ||
        (d.owner_name ?? "").toLowerCase().includes(q);
      return matchesSearch && (!stageFilter || d.stage === stageFilter);
    });
  }, [deals, search, stageFilter]);

  const totals = useMemo(() => ({
    pipelineValue: filteredDeals.filter((d) => d.stage !== "closed_lost").reduce((s, d) => s + (d.value ?? 0), 0),
    wonValue:      filteredDeals.filter((d) => d.stage === "closed_won").reduce((s, d) => s + (d.value ?? 0), 0),
    openCount:     filteredDeals.filter((d) => !["closed_won", "closed_lost"].includes(d.stage)).length,
  }), [filteredDeals]);

  const byStage = useMemo(() => {
    const buckets: Record<string, DealRow[]> = {};
    STAGES.forEach((s) => (buckets[s.value] = []));
    filteredDeals.forEach((d) => { (buckets[d.stage] ?? (buckets[d.stage] = [])).push(d); });
    return buckets;
  }, [filteredDeals]);

  // ── Stage update ───────────────────────────────────────────────────────────

  const updateStage = useCallback(async (dealId: string, stage: string) => {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage } : d)));
    try {
      const res  = await fetch(`/api/sales/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update stage");
      message.success("Stage updated");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to update stage");
      fetchData();
    }
  }, [fetchData]);

  // ── Edit single deal ───────────────────────────────────────────────────────

  const openEditDrawer = useCallback((deal: DealRow) => {
    setEditingDeal(deal);
    setEditDrawerOpen(true);
    setTimeout(() => {
      dealEditForm.setFieldsValue({
        deal_name:           deal.deal_name,
        pipeline:            deal.pipeline ?? "Client Acquisition pipeline",
        stage:               deal.stage,
        value:               deal.value,
        expected_close_date: deal.expected_close_date ? dayjs(deal.expected_close_date) : undefined,
        owner_id:            deal.owner_id,
        deal_type:           deal.deal_type,
        priority:            deal.priority,
        contact_id:          deal.contact_id,
        account_id:          deal.account_id,
      });
    }, 0);
  }, [dealEditForm]);

  const closeEditDrawer = useCallback(() => {
    setEditDrawerOpen(false);
    setEditingDeal(null);
    dealEditForm.resetFields();
  }, [dealEditForm]);

  const submitEditDeal = async () => {
    if (!editingDeal) return;
    try {
      const values = await dealEditForm.validateFields();
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        stage:               values.stage,
        pipeline:            values.pipeline    || null,
        deal_type:           values.deal_type   || null,
        priority:            values.priority    || null,
        owner_id:            values.owner_id    || null,
        deal_associate:      values.deal_associate ?? null,
        account_id:          values.account_id  || null,
        value:               typeof values.value === "number" ? values.value : null,
        expected_close_date: values.expected_close_date
          ? dayjs(values.expected_close_date).toISOString()
          : null,
        deal_name:           values.deal_name,
      };

      const res  = await fetch(`/api/sales/deals/${editingDeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update deal");
      message.success("Deal updated");
      closeEditDrawer();
      fetchData();
    } catch (err) {
      if (err instanceof Error && err.message) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const activeDeal = useMemo(() => (activeId ? deals.find((d) => d.id === activeId) ?? null : null), [activeId, deals]);

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);
  const handleDragEnd   = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const deal = deals.find((d) => d.id === active.id);
    if (!deal) return;
    const target = over.id as string;
    if (deal.stage !== target && STAGES.some((s) => s.value === target)) updateStage(deal.id, target);
  };

  // ── Selection helpers ──────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => setSelectedIds(new Set(filteredDeals.map((d) => d.id)));
  const clearSelection = () => setSelectedIds(new Set());

  // ── Bulk Delete ────────────────────────────────────────────────────────────

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    Modal.confirm({
      title: `Delete ${count} deal${count > 1 ? "s" : ""}?`,
      content: "This action cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        setBulkWorking(true);
        try {
          const results = await Promise.all(
            [...selectedIds].map((id) =>
              fetch(`/api/sales/deals/${id}`, { method: "DELETE", credentials: "include" })
            )
          );
          const failed = results.filter((r) => !r.ok).length;
          if (failed > 0) message.warning(`${count - failed} deleted, ${failed} failed`);
          else message.success(`${count} deal${count > 1 ? "s" : ""} deleted`);
          clearSelection();
          fetchData();
        } catch {
          message.error("Delete failed");
        } finally {
          setBulkWorking(false);
        }
      },
    });
  };

  // ── Bulk Assign ────────────────────────────────────────────────────────────

  const handleBulkAssign = async () => {
    try {
      const values = await assignForm.validateFields();
      setBulkWorking(true);
      const results = await Promise.all(
        [...selectedIds].map((id) =>
          fetch(`/api/sales/deals/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ owner_id: values.owner_id }),
          })
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed === 0) message.success(`${selectedIds.size} deal${selectedIds.size > 1 ? "s" : ""} assigned`);
      else message.warning(`${selectedIds.size - failed} assigned, ${failed} failed`);
      setAssignModalOpen(false);
      assignForm.resetFields();
      clearSelection();
      fetchData();
    } catch {
      // validation or network error
    } finally {
      setBulkWorking(false);
    }
  };

  // ── Bulk Edit ─────────────────────────────────────────────────────────────

  const handleBulkEdit = async () => {
    try {
      const values = await editForm.validateFields();
      const payload: Record<string, unknown> = {};
      if (values.stage)    payload.stage    = values.stage;
      if (values.priority) payload.priority = values.priority;
      if (!Object.keys(payload).length) {
        message.info("Nothing to update — pick at least one field");
        return;
      }
      setBulkWorking(true);
      const results = await Promise.all(
        [...selectedIds].map((id) =>
          fetch(`/api/sales/deals/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          })
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed === 0) message.success(`${selectedIds.size} deal${selectedIds.size > 1 ? "s" : ""} updated`);
      else message.warning(`${selectedIds.size - failed} updated, ${failed} failed`);
      setEditModalOpen(false);
      editForm.resetFields();
      clearSelection();
      fetchData();
    } catch {
      // validation or network
    } finally {
      setBulkWorking(false);
    }
  };

  // ── Table columns ──────────────────────────────────────────────────────────

  const columns: ColumnsType<DealRow> = [
    { title: "Deal", dataIndex: "deal_name", key: "deal_name", width: 220, ellipsis: true, render: (v, r) => <span style={{ fontWeight: 600, color: stageColor(r.stage) }}>{v}</span> },
    { title: "Account", dataIndex: "account_name", key: "account_name", width: 180, ellipsis: true, render: (_: unknown, r) => <Tooltip title={r.account_id ?? undefined}><span>{r.account_name || "—"}</span></Tooltip> },
    { title: "Contact", dataIndex: "contact_name", key: "contact_name", width: 180, ellipsis: true, render: (_: unknown, r) => <Tooltip title={r.contact_id ?? undefined}><span>{r.contact_name || "—"}</span></Tooltip> },
    { title: "Value",   dataIndex: "value",        key: "value",        width: 130, render: (v: number | null) => (v != null ? `$${Number(v).toLocaleString()}` : "—") },
    { title: "Stage",   dataIndex: "stage",        key: "stage",        width: 220, render: (v: string, r: DealRow) => <Select value={v} onChange={(next) => updateStage(r.id, next)} style={{ width: "100%" }} options={STAGES.map((s) => ({ value: s.value, label: s.label }))} /> },
    { title: "Priority", dataIndex: "priority", key: "priority", width: 100, render: (v: string | null) => v ? <Tag color={PRIORITIES.find((p) => p.value === v)?.color} style={{ margin: 0 }}>{v.toUpperCase()}</Tag> : "—" },
    { title: "Owner", dataIndex: "owner_name", key: "owner_name", width: 160, ellipsis: true, render: (v) => v || "—" },
    { title: "Close Date", dataIndex: "expected_close_date", key: "expected_close_date", width: 130, render: (v: string | null) => v ? dayjs(v).format("DD MMM YYYY") : "—" },
    { title: "Created",   dataIndex: "created_at",           key: "created_at",           width: 120, render: (v: string) => dayjs(v).format("DD MMM YYYY") },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Header */}
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <Title level={2} style={{ margin: 0, fontSize: 26 }}>Deals / Opportunities</Title>
          <Text type="secondary">Track pipeline stages, update progress, and monitor revenue.</Text>
        </div>
        <Space>
          <Segmented value={view} onChange={(v) => setView(v as any)} options={["Pipeline", "List"]} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>New Deal</Button>
        </Space>
      </div>

      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { title: "Pipeline Value", value: totals.pipelineValue, prefix: "$" },
          { title: "Won Revenue",    value: totals.wonValue,      prefix: "$" },
          { title: "Open Deals",     value: totals.openCount,     prefix: undefined },
        ].map((s) => (
          <Col xs={24} sm={8} key={s.title}>
            <Card style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(15,23,42,0.06)" }}>
              <Statistic title={s.title} value={s.value} prefix={s.prefix} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <Card style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(15,23,42,0.06)", marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Input allowClear placeholder="Search deals, accounts, contacts, owners..." prefix={<SearchOutlined style={{ color: "#9ca3af" }} />} value={search} onChange={(e) => setSearch(e.target.value)} />
          </Col>
          <Col xs={24} md={12}>
            <Select allowClear placeholder="Filter by stage" style={{ width: "100%" }} value={stageFilter} onChange={setStageFilter} options={STAGES.map((s) => ({ value: s.value, label: s.label }))} />
          </Col>
        </Row>
      </Card>

      {/* Views */}
      {view === "List" ? (
        <Card style={{ borderRadius: 16, boxShadow: "0 2px 8px rgba(15,23,42,0.06)" }} styles={{ body: { padding: 0 } }}>
          <Table columns={columns} dataSource={filteredDeals} loading={loading} rowKey="id" scroll={{ x: 1300, y: 520 }} pagination={{ defaultPageSize: 10, showSizeChanger: true, showTotal: (t) => `Total ${t} deals` }} size="middle" />
        </Card>
      ) : (
        <div style={{ position: "relative" }}>
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: selectedIds.size > 0 ? 72 : 16, alignItems: "flex-start" }}>
              {STAGES.map((s) => (
                <DroppableColumn
                  key={s.value}
                  stage={s}
                  deals={byStage[s.value] ?? []}
                  onStageChange={updateStage}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onEdit={openEditDrawer}
                />
              ))}
            </div>
            <DragOverlay>
              {activeDeal ? (
                <div style={{ width: 260 }}>
                  <DealCard deal={activeDeal} onStageChange={updateStage} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* ── Floating selection toolbar ── */}
          {selectedIds.size > 0 && (
            <div
              style={{
                position: "sticky",
                bottom: 16,
                zIndex: 100,
                background: "#1e293b",
                borderRadius: 12,
                padding: "10px 18px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                color: "#fff",
                marginTop: 8,
              }}
            >
              {/* Count + select-all */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  {selectedIds.size} deal{selectedIds.size > 1 ? "s" : ""} selected
                </span>
                {selectedIds.size < filteredDeals.length && (
                  <Button
                    type="link"
                    size="small"
                    style={{ color: "#38bdf8", padding: 0, height: "auto" }}
                    onClick={selectAll}
                  >
                    Select all {filteredDeals.length} deals
                  </Button>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  size="small"
                  icon={<UserSwitchOutlined />}
                  style={{ background: "#334155", color: "#fff", border: "1px solid #475569" }}
                  onClick={() => setAssignModalOpen(true)}
                  loading={bulkWorking}
                >
                  Assign
                </Button>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  style={{ background: "#334155", color: "#fff", border: "1px solid #475569" }}
                  onClick={() => setEditModalOpen(true)}
                  loading={bulkWorking}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleBulkDelete}
                  loading={bulkWorking}
                >
                  Delete
                </Button>
                <Button
                  size="small"
                  type="text"
                  icon={<CloseOutlined />}
                  style={{ color: "#94a3b8" }}
                  onClick={clearSelection}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Assign Modal ── */}
      <Modal
        title={
          <span>
            <UserSwitchOutlined style={{ marginRight: 8, color: "#0d9488" }} />
            Assign {selectedIds.size} deal{selectedIds.size > 1 ? "s" : ""} to
          </span>
        }
        open={assignModalOpen}
        onCancel={() => { setAssignModalOpen(false); assignForm.resetFields(); }}
        onOk={handleBulkAssign}
        okText="Assign"
        okButtonProps={{ loading: bulkWorking }}
        destroyOnClose
      >
        <Form form={assignForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="owner_id" label="New owner" rules={[{ required: true, message: "Please select an owner" }]}>
            <Select
              showSearch
              placeholder="Search owner..."
              optionFilterProp="label"
              options={users.map((u) => ({ value: u.id, label: u.full_name || u.email || u.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Bulk Edit Modal ── */}
      <Modal
        title={
          <span>
            <EditOutlined style={{ marginRight: 8, color: "#7c3aed" }} />
            Edit {selectedIds.size} deal{selectedIds.size > 1 ? "s" : ""}
          </span>
        }
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); editForm.resetFields(); }}
        onOk={handleBulkEdit}
        okText="Apply changes"
        okButtonProps={{ loading: bulkWorking }}
        destroyOnClose
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Only filled fields will be updated. Leave blank to keep existing values.
        </Text>
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="stage" label="Deal stage">
            <Select
              allowClear
              placeholder="— keep current —"
              options={STAGES.map((s) => ({
                value: s.value,
                label: (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    {s.label}
                  </div>
                ),
              }))}
            />
          </Form.Item>
          <Form.Item name="priority" label="Priority">
            <Select
              allowClear
              placeholder="— keep current —"
              options={PRIORITIES.map((p) => ({
                value: p.value,
                label: (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
                    {p.label}
                  </div>
                ),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Edit Deal Drawer ── */}
      <Drawer
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <EditOutlined style={{ color: "#0d9488" }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Edit Deal</span>
            {editingDeal && (
              <Tag color="default" style={{ marginLeft: 4, fontSize: 11 }}>
                {editingDeal.deal_name}
              </Tag>
            )}
          </div>
        }
        placement="right"
        width={520}
        open={editDrawerOpen}
        onClose={closeEditDrawer}
        destroyOnClose
        styles={{ body: { padding: "20px 24px", background: "#fafafa" } }}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button onClick={closeEditDrawer}>Cancel</Button>
            <Button type="primary" onClick={submitEditDeal} loading={submitting}>
              Save changes
            </Button>
          </div>
        }
      >
        <Form form={dealEditForm} layout="vertical">

          <Form.Item name="deal_name" label={<span style={{ fontWeight: 600 }}>Deal name</span>} rules={[{ required: true, message: "Please enter deal name" }]}>
            <Input size="large" />
          </Form.Item>

          <Form.Item name="pipeline" label={<span style={{ fontWeight: 600 }}>Pipeline</span>}>
            <Select size="large" options={PIPELINES.map((p) => ({ value: p, label: p }))} />
          </Form.Item>

          <Form.Item name="stage" label={<span style={{ fontWeight: 600 }}>Deal stage</span>}>
            <Select
              size="large"
              options={STAGES.map((s) => ({
                value: s.value,
                label: (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    {s.label}
                  </div>
                ),
              }))}
            />
          </Form.Item>

          <Form.Item name="value" label={<span style={{ fontWeight: 600 }}>Amount</span>}>
            <InputNumber
              style={{ width: "100%" }}
              size="large"
              min={0}
              prefix="$"
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(v) => v?.replace(/,/g, "") as any}
            />
          </Form.Item>

          <Form.Item name="expected_close_date" label={<span style={{ fontWeight: 600 }}>Close date</span>}>
            <DatePicker style={{ width: "100%" }} size="large" format="MM/DD/YYYY" placeholder="MM/DD/YYYY" />
          </Form.Item>

          <Form.Item name="owner_id" label={<span style={{ fontWeight: 600 }}>Deal owner</span>}>
            <Select
              size="large"
              allowClear
              showSearch
              placeholder="Search owner..."
              optionFilterProp="label"
              options={users.map((u) => ({ value: u.id, label: u.full_name || u.email || u.id }))}
            />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="deal_type" label={<span style={{ fontWeight: 600 }}>Deal type</span>}>
                <Select size="large" allowClear placeholder="Select type" options={DEAL_TYPES.map((t) => ({ value: t, label: t }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="priority" label={<span style={{ fontWeight: 600 }}>Priority</span>}>
                <Select
                  size="large"
                  allowClear
                  placeholder="Select priority"
                  options={PRIORITIES.map((p) => ({
                    value: p.value,
                    label: (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
                        {p.label}
                      </div>
                    ),
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 16px" }}>
            Associate Deal with
          </Divider>

          <Form.Item name="deal_associate" label={<span style={{ fontWeight: 600 }}>Contact</span>}>
            <Select
              size="large"
              allowClear
              showSearch
              placeholder="Search by lead name or email..."
              optionFilterProp="label"
              options={dealAssociateOptions}
              filterOption={(input, option) =>
                String(option?.label ?? "")
                  .toLowerCase()
                  .includes(String(input).toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item name="account_id" label={<span style={{ fontWeight: 600 }}>Company</span>}>
            <Select
              size="large"
              allowClear
              showSearch
              placeholder="Search company..."
              optionFilterProp="label"
              options={accounts.map((a) => ({ value: a.id, label: a.company_name || a.id }))}
            />
          </Form.Item>

        </Form>
      </Drawer>

      <NewDealDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={fetchData}
        lookups={{ accounts, dealAssociateOptions, users, currentUser }}
      />
    </div>
  );
}
