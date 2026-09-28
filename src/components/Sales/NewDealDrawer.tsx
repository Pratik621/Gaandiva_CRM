"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import {
  Button,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Tag,
  message,
} from "antd";
import { DeleteOutlined, PlusCircleOutlined } from "@ant-design/icons";
import { DEAL_ASSOCIATE_PREFIX_CONTACT, DEAL_ASSOCIATE_PREFIX_LEAD } from "@/lib/sales/dealAssociate";

// ─── Shared with /sales/deals ───────────────────────────────────────────────

type LineItem = { name: string; quantity: number; amount: number };

type TimelineState = { enabled: boolean; range: string; customDate: Dayjs | null };

const STAGES = [
  { value: "introductory_meeting", label: "Introductory meeting", color: "#0d9488", probability: 20 },
  { value: "campaign_assessment", label: "Campaign assessment", color: "#0891b2", probability: 35 },
  { value: "strategy_proposal", label: "Strategy proposal", color: "#7c3aed", probability: 50 },
  { value: "strategy_presentation", label: "Strategy presentation", color: "#db2777", probability: 65 },
  { value: "objection_handling", label: "Objection handling", color: "#ea580c", probability: 75 },
  { value: "finalizing_terms", label: "Finalizing terms", color: "#f59e0b", probability: 90 },
  { value: "closed_won", label: "Closed won", color: "#16a34a", probability: 100 },
  { value: "closed_lost", label: "Closed lost", color: "#ef4444", probability: 0 },
] as const;

const PIPELINES = ["Client Acquisition pipeline", "Renewal pipeline", "Upsell pipeline"];
const DEAL_TYPES = ["New business", "Existing business", "Partner deal", "Renewal"];
const PRIORITIES = [
  { value: "low", label: "Low", color: "#6b7280" },
  { value: "medium", label: "Medium", color: "#f59e0b" },
  { value: "high", label: "High", color: "#ef4444" },
];
const TIMELINE_RANGES = [
  { value: "last_30", label: "Last 30 days" },
  { value: "last_60", label: "Last 60 days" },
  { value: "last_90", label: "Last 90 days" },
  { value: "all_time", label: "All time" },
  { value: "custom", label: "Custom date" },
];
const DEFAULT_TIMELINE: TimelineState = { enabled: false, range: "last_30", customDate: null };

export type NewDealDrawerLookups = {
  accounts: { id: string; company_name: string | null }[];
  /** Lead / contact rows: value is `l:leadId` or `c:contactId`, label is `Name · email` */
  dealAssociateOptions: { value: string; label: string }[];
  users: { id: string; full_name: string | null; email: string | null }[];
  currentUser: { id: string; full_name: string | null; email: string | null } | null;
};

export type NewDealDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a deal is created successfully */
  onCreated?: () => void;
  /** Pre-filled company (lead / account context) */
  defaultAccountId?: string | null;
  /** Pre-filled CRM contact (when you already have a contacts.id) */
  defaultContactId?: string | null;
  /** Pre-filled sales lead (lead detail page — uses lead list value `l:…`) */
  defaultLeadId?: string | null;
  /**
   * When provided (e.g. from /sales/deals), lookups are not fetched again.
   * Omit on lead/account pages to load inside the drawer.
   */
  lookups?: NewDealDrawerLookups | null;
};

function LineItemRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: LineItem;
  index: number;
  onChange: (i: number, field: keyof LineItem, value: string | number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
      }}
    >
      <Input
        placeholder="Item name"
        value={item.name}
        onChange={(e) => onChange(index, "name", e.target.value)}
        style={{ flex: 2 }}
      />
      <InputNumber
        placeholder="Qty"
        min={0}
        value={item.quantity}
        onChange={(v) => onChange(index, "quantity", v ?? 0)}
        style={{ width: 80 }}
      />
      <InputNumber
        placeholder="Amount"
        min={0}
        prefix="$"
        value={item.amount}
        onChange={(v) => onChange(index, "amount", v ?? 0)}
        style={{ flex: 1 }}
      />
      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onRemove(index)} size="small" />
    </div>
  );
}

export function NewDealDrawer({
  open,
  onClose,
  onCreated,
  defaultAccountId = null,
  defaultContactId = null,
  defaultLeadId = null,
  lookups: lookupsProp,
}: NewDealDrawerProps) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [contactTimeline, setContactTimeline] = useState<TimelineState>({ ...DEFAULT_TIMELINE });
  const [companyTimeline, setCompanyTimeline] = useState<TimelineState>({ ...DEFAULT_TIMELINE });

  const [internalAccounts, setInternalAccounts] = useState<NewDealDrawerLookups["accounts"]>([]);
  const [internalAssociateOptions, setInternalAssociateOptions] = useState<NewDealDrawerLookups["dealAssociateOptions"]>([]);
  const [internalUsers, setInternalUsers] = useState<NewDealDrawerLookups["users"]>([]);
  const [internalCurrentUser, setInternalCurrentUser] = useState<NewDealDrawerLookups["currentUser"]>(null);

  const useExternalLookups = lookupsProp != null;
  const accounts = useExternalLookups ? lookupsProp.accounts : internalAccounts;
  const dealAssociateOptions = useExternalLookups ? lookupsProp.dealAssociateOptions : internalAssociateOptions;
  const users = useExternalLookups ? lookupsProp.users : internalUsers;
  const currentUser = useExternalLookups ? lookupsProp.currentUser : internalCurrentUser;

  const fetchLookups = useCallback(async () => {
    try {
      const [accRes, optRes, usrRes, profRes] = await Promise.all([
        fetch("/api/sales/accounts", { credentials: "include" }),
        fetch("/api/sales/deal-lead-options", { credentials: "include" }),
        fetch("/api/sales/deal-owners", { credentials: "include" }),
        fetch("/api/profile", { credentials: "include" }),
      ]);
      const accJson = await accRes.json().catch(() => ({}));
      const optJson = await optRes.json().catch(() => ({}));
      const usrJson = await usrRes.json().catch(() => ({}));
      const profJson = await profRes.json().catch(() => ({}));

      if (accRes.ok) {
        setInternalAccounts((accJson.accounts ?? []).map((a: { id: string; company_name: string | null }) => ({ id: a.id, company_name: a.company_name ?? null })));
      }
      if (optRes.ok) {
        setInternalAssociateOptions((optJson.options ?? []) as { value: string; label: string }[]);
      }
      if (usrRes.ok) {
        setInternalUsers((usrJson.users ?? []).map((u: { id: string; full_name: string | null; email: string | null }) => ({ id: u.id, full_name: u.full_name ?? null, email: u.email ?? null })));
      }
      if (profRes.ok && profJson.id) {
        setInternalCurrentUser({
          id: profJson.id,
          full_name: profJson.full_name ?? null,
          email: profJson.email ?? null,
        });
      }
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    if (useExternalLookups) return;
    void fetchLookups();
  }, [useExternalLookups, fetchLookups]);

  const watchedDealAssociate = Form.useWatch("deal_associate", form);
  const watchedAccountId = Form.useWatch("account_id", form);
  const selectedAssociateLabel =
    dealAssociateOptions.find((o) => o.value === watchedDealAssociate)?.label ?? null;
  const selectedCompanyName = accounts.find((a) => a.id === watchedAccountId)?.company_name ?? null;

  const addLineItem = () => setLineItems((p) => [...p, { name: "", quantity: 1, amount: 0 }]);
  const updateLineItem = (i: number, field: keyof LineItem, value: string | number) =>
    setLineItems((p) => p.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  const removeLineItem = (i: number) => setLineItems((p) => p.filter((_, idx) => idx !== i));
  const lineItemsTotal = useMemo(() => lineItems.reduce((s, li) => s + li.quantity * li.amount, 0), [lineItems]);

  const resetDrawerUi = useCallback(() => {
    form.resetFields();
    setLineItems([]);
    setContactTimeline({ ...DEFAULT_TIMELINE });
    setCompanyTimeline({ ...DEFAULT_TIMELINE });
  }, [form]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!opening) return;
    resetDrawerUi();
    const associateDefault = defaultLeadId
      ? `${DEAL_ASSOCIATE_PREFIX_LEAD}${defaultLeadId}`
      : defaultContactId
        ? `${DEAL_ASSOCIATE_PREFIX_CONTACT}${defaultContactId}`
        : undefined;
    form.setFieldsValue({
      stage: "introductory_meeting",
      pipeline: "Client Acquisition pipeline",
      account_id: defaultAccountId || undefined,
      deal_associate: associateDefault,
    });
  }, [open, defaultAccountId, defaultContactId, defaultLeadId, form, resetDrawerUi]);

  useEffect(() => {
    if (!open || !currentUser || users.length === 0) return;
    const allowed = new Set(users.map((u) => u.id));
    if (allowed.has(currentUser.id)) {
      form.setFieldValue("owner_id", currentUser.id);
    }
  }, [open, currentUser, users, form]);

  const handleClose = () => {
    resetDrawerUi();
    onClose();
  };

  const submitNewDeal = async (andAnother = false) => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const contactTimelinePayload = contactTimeline.enabled
        ? {
            enabled: true,
            range: contactTimeline.range,
            custom_date:
              contactTimeline.range === "custom" && contactTimeline.customDate
                ? contactTimeline.customDate.toISOString()
                : null,
          }
        : null;
      const companyTimelinePayload = companyTimeline.enabled
        ? {
            enabled: true,
            range: companyTimeline.range,
            custom_date:
              companyTimeline.range === "custom" && companyTimeline.customDate
                ? companyTimeline.customDate.toISOString()
                : null,
          }
        : null;

      const payload = {
        deal_name: values.deal_name,
        account_id: values.account_id || null,
        deal_associate: (values.deal_associate as string | undefined) || null,
        value: typeof values.value === "number" ? values.value : lineItemsTotal || null,
        stage: values.stage || "introductory_meeting",
        pipeline: values.pipeline || "Client Acquisition pipeline",
        deal_type: values.deal_type || null,
        priority: values.priority || null,
        owner_id: values.owner_id || currentUser?.id || null,
        line_items: lineItems.filter((li) => li.name.trim()).length > 0 ? lineItems : null,
        expected_close_date: values.expected_close_date ? dayjs(values.expected_close_date).toISOString() : null,
        contact_timeline: contactTimelinePayload,
        company_timeline: companyTimelinePayload,
      };

      const res = await fetch("/api/sales/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create deal");
      message.success("Deal created");
      onCreated?.();
      if (andAnother) {
        resetDrawerUi();
        const associateDefault = defaultLeadId
          ? `${DEAL_ASSOCIATE_PREFIX_LEAD}${defaultLeadId}`
          : defaultContactId
            ? `${DEAL_ASSOCIATE_PREFIX_CONTACT}${defaultContactId}`
            : undefined;
        form.setFieldsValue({
          stage: "introductory_meeting",
          pipeline: "Client Acquisition pipeline",
          account_id: defaultAccountId || undefined,
          deal_associate: associateDefault,
        });
        if (currentUser) form.setFieldValue("owner_id", currentUser.id);
      } else {
        handleClose();
      }
    } catch (err) {
      if (err instanceof Error && err.message) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title={<span style={{ fontSize: 16, fontWeight: 700 }}>New Deal</span>}
      placement="right"
      width={520}
      open={open}
      onClose={handleClose}
      destroyOnClose
      styles={{ body: { padding: "20px 24px", background: "#fafafa" } }}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={() => void submitNewDeal(true)} loading={submitting}>
            Create and add another
          </Button>
          <Button type="primary" onClick={() => void submitNewDeal(false)} loading={submitting}>
            Create
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" initialValues={{ stage: "introductory_meeting", pipeline: "Client Acquisition pipeline" }}>
        <Form.Item name="deal_name" label={<span style={{ fontWeight: 600 }}>Deal name</span>} rules={[{ required: true, message: "Please enter deal name" }]}>
          <Input placeholder="e.g. Q2 Renewal – Acme Corp" size="large" />
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
            placeholder="0"
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            parser={(v) => v?.replace(/,/g, "") as never}
          />
        </Form.Item>

        <Form.Item name="expected_close_date" label={<span style={{ fontWeight: 600 }}>Close date</span>}>
          <DatePicker style={{ width: "100%" }} size="large" format="MM/DD/YYYY" placeholder="MM/DD/YYYY" />
        </Form.Item>

        <Form.Item
          name="owner_id"
          label={
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Deal owner</span>
              {currentUser && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#0d9488",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 4,
                    padding: "1px 6px",
                  }}
                >
                  you
                </span>
              )}
            </div>
          }
        >
          <Select
            size="large"
            allowClear
            showSearch
            placeholder={currentUser ? currentUser.full_name || currentUser.email || "Select owner" : "Search owner..."}
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

        <Form.Item name="deal_associate" label={<span style={{ fontWeight: 600 }}>Contact</span>} style={{ marginBottom: 8 }}>
          <Select
            size="large"
            allowClear
            showSearch
            placeholder="Search by lead name or email..."
            options={dealAssociateOptions}
            optionFilterProp="label"
            filterOption={(input, option) =>
              String(option?.label ?? "")
                .toLowerCase()
                .includes(String(input).toLowerCase())
            }
          />
        </Form.Item>
        <div style={{ marginBottom: 16 }}>
          <Checkbox
            checked={contactTimeline.enabled}
            onChange={(e) => setContactTimeline((p) => ({ ...p, enabled: e.target.checked }))}
            style={{ fontSize: 12, color: "#374151" }}
          >
            Add timeline activity from this Contact
          </Checkbox>
          {contactTimeline.enabled && (
            <div style={{ marginTop: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 8, lineHeight: 1.6 }}>
                  Add timeline activity from <strong style={{ color: "#0d9488" }}>{selectedAssociateLabel ?? "the selected contact"}</strong> to this Deal starting from
              </div>
              <Select
                size="small"
                value={contactTimeline.range}
                onChange={(v) => setContactTimeline((p) => ({ ...p, range: v, customDate: null }))}
                style={{ width: "100%" }}
                options={TIMELINE_RANGES}
              />
              {contactTimeline.range === "custom" && (
                <DatePicker
                  size="small"
                  style={{ width: "100%", marginTop: 8 }}
                  placeholder="Pick a start date"
                  value={contactTimeline.customDate}
                  onChange={(d) => setContactTimeline((p) => ({ ...p, customDate: d }))}
                  format="MM/DD/YYYY"
                />
              )}
            </div>
          )}
        </div>

        <Form.Item name="account_id" label={<span style={{ fontWeight: 600 }}>Company</span>} style={{ marginBottom: 8 }}>
          <Select
            size="large"
            allowClear
            showSearch
            placeholder="Search company..."
            optionFilterProp="label"
            options={accounts.map((a) => ({ value: a.id, label: a.company_name || a.id }))}
          />
        </Form.Item>
        <div style={{ marginBottom: 16 }}>
          <Checkbox
            checked={companyTimeline.enabled}
            onChange={(e) => setCompanyTimeline((p) => ({ ...p, enabled: e.target.checked }))}
            style={{ fontSize: 12, color: "#374151" }}
          >
            Add timeline activity from this Company
          </Checkbox>
          {companyTimeline.enabled && (
            <div style={{ marginTop: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 8, lineHeight: 1.6 }}>
                Add timeline activity from <strong style={{ color: "#4f46e5" }}>{selectedCompanyName ?? "the selected company"}</strong> to this Deal starting from
              </div>
              <Select
                size="small"
                value={companyTimeline.range}
                onChange={(v) => setCompanyTimeline((p) => ({ ...p, range: v, customDate: null }))}
                style={{ width: "100%" }}
                options={TIMELINE_RANGES}
              />
              {companyTimeline.range === "custom" && (
                <DatePicker
                  size="small"
                  style={{ width: "100%", marginTop: 8 }}
                  placeholder="Pick a start date"
                  value={companyTimeline.customDate}
                  onChange={(d) => setCompanyTimeline((p) => ({ ...p, range: "custom", customDate: d }))}
                  format="MM/DD/YYYY"
                />
              )}
            </div>
          )}
        </div>

        <Divider orientation="left" style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 16px" }}>
          Add line item
        </Divider>

        {lineItems.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 6, padding: "0 12px" }}>
            <div style={{ flex: 2, fontSize: 11, color: "#6b7280", fontWeight: 600 }}>ITEM NAME</div>
            <div style={{ width: 80, fontSize: 11, color: "#6b7280", fontWeight: 600 }}>QTY</div>
            <div style={{ flex: 1, fontSize: 11, color: "#6b7280", fontWeight: 600 }}>AMOUNT</div>
            <div style={{ width: 32 }} />
          </div>
        )}
        {lineItems.map((item, i) => (
          <LineItemRow key={i} item={item} index={i} onChange={updateLineItem} onRemove={removeLineItem} />
        ))}
        {lineItems.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Tag color="blue" style={{ fontSize: 13, padding: "2px 10px" }}>
              Total: ${Number(lineItemsTotal).toLocaleString()}
            </Tag>
          </div>
        )}
        <Button type="dashed" icon={<PlusCircleOutlined />} block onClick={addLineItem} style={{ borderColor: "#0d9488", color: "#0d9488" }}>
          Add a line item
        </Button>
      </Form>
    </Drawer>
  );
}
