"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  Avatar,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import { LeadFormFields } from "@/components/Sales/LeadFormFields";
import { LeadNoteModal, dueDateForPreset, type FollowUpPreset } from "@/components/Sales/LeadNoteModal";
import { NewDealDrawer } from "@/components/Sales/NewDealDrawer";
import { DEAL_STAGE_SELECT_OPTIONS } from "@/constants/salesDealStages";
import { buildSalesLeadPayload, leadRecordToFormValues } from "@/lib/sales/leadFormPayload";
import {
  ArrowLeftOutlined,
  BankOutlined,
  CalendarOutlined,
  CopyOutlined,
  DollarOutlined,
  FileOutlined,
  MailOutlined,
  PhoneOutlined,
  PlusOutlined,
  ProfileOutlined,
  SafetyCertificateOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import React from "react";

dayjs.extend(relativeTime);

const ACCENT = "#0d9488";
const PAGE_BG = "#f3f5f7";

type LeadDetail = Record<string, unknown> & {
  id: string;
  lead_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company: string | null;
  account_id: string | null;
  account_company_name: string | null;
  website: string | null;
  status: string;
  lead_score: string | null;
  assigned_to_name: string | null;
  last_contacted: string | null;
  next_followup: string | null;
  budget: string | null;
  purchase_timeline: string | null;
  lead_source: string | null;
  country: string | null;
  linkedin: string | null;
  industry: string | null;
  company_size: string | null;
  annual_revenue: string | null;
  created_at: string;
};

type TimelineItem = {
  id: string;
  activity_type: string;
  notes: string | null;
  activity_date: string;
  owner_name: string | null;
};

type DealLite = {
  id: string;
  deal_name: string | null;
  value: number | null;
  stage: string | null;
  pipeline: string | null;
  priority: string | null;
  owner_name: string | null;
  expected_close_date: string | null;
};

type TicketLite = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
};

type AttachmentLite = {
  id: string;
  file_name: string;
  url: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  open: "Open",
  in_progress: "In progress",
  open_deal: "Open deal",
  unqualified: "Unqualified",
  attempted_to_contact: "Attempted to contact",
  connected: "Connected",
  bad_timing: "Bad timing",
  converted: "Converted",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  lead: "Lead",
  marketing_qualified_lead: "Marketing Qualified Lead",
  sales_qualified_lead: "Sales Qualified Lead",
  opportunity: "Opportunity",
  customer: "Customer",
  evangelist: "Evangelist",
  other: "Other",
};

const TYPE_META: Record<string, { label: string; color: string }> = {
  note: { label: "Note", color: "#7c3aed" },
  call: { label: "Call", color: "#4f46e5" },
  email: { label: "Email", color: "#0891b2" },
  meeting: { label: "Meeting", color: "#7c3aed" },
  demo: { label: "Demo", color: "#f59e0b" },
  task: { label: "Task", color: "#4f46e5" },
  lifecycle_change: { label: "Update", color: "#0d9488" },
  system: { label: "System", color: "#64748b" },
};

function initials(name: string | null) {
  if (!name?.trim()) return "?";
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

function linkedinHref(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

function LinkedInLink({ value }: { value: string | null | undefined }) {
  const href = linkedinHref(value);
  if (!href) return <>—</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {value?.trim() || href}
    </a>
  );
}

function groupByMonth(items: TimelineItem[]) {
  const map = new Map<string, TimelineItem[]>();
  for (const it of items) {
    const key = dayjs(it.activity_date).format("MMMM YYYY");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  return map;
}

const { Title, Text, Paragraph } = Typography;

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [activities, setActivities] = useState<TimelineItem[]>([]);
  const [deals, setDeals] = useState<DealLite[]>([]);
  const [tickets, setTickets] = useState<TicketLite[]>([]);
  const [attachments, setAttachments] = useState<AttachmentLite[]>([]);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  const [dealOpen, setDealOpen] = useState(false);

  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketForm] = Form.useForm();
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  const [activityTab, setActivityTab] = useState<string>("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [uploading, setUploading] = useState(false);

  /* quick-log modals for Call / Email / Task / Meeting */
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [logEmailOpen, setLogEmailOpen] = useState(false);
  const [logTaskOpen, setLogTaskOpen] = useState(false);
  const [logMeetingOpen, setLogMeetingOpen] = useState(false);
  const [logForm] = Form.useForm();
  const [logSaving, setLogSaving] = useState(false);

  /** Returns "YYYY-MM-DDTHH:mm" in the user's local timezone — correct for datetime-local inputs. */
  const localNow = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openLogModal = (setOpen: (v: boolean) => void) => {
    logForm.setFieldsValue({ notes: "", activity_date: localNow() });
    setOpen(true);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [lr, ar, dr, tr, att, listRes] = await Promise.all([
        fetch(`/api/sales/leads/${id}`, { credentials: "include" }),
        fetch(`/api/sales/leads/${id}/activities`, { credentials: "include" }),
        fetch(`/api/sales/leads/${id}/deals`, { credentials: "include" }),
        fetch(`/api/sales/leads/${id}/tickets`, { credentials: "include" }),
        fetch(`/api/sales/leads/${id}/attachments`, { credentials: "include" }),
        fetch("/api/sales/leads", { credentials: "include" }),
      ]);
      const lj = await lr.json();
      if (!lr.ok) throw new Error(lj.error || "Failed to load lead");
      setLead(lj.lead as LeadDetail);

      const listJson = await listRes.json().catch(() => ({}));
      if (listRes.ok && Array.isArray(listJson.agents)) {
        setAgents(listJson.agents.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
      }

      const aj = await ar.json();
      setActivities(ar.ok ? (aj.activities ?? []) : []);

      const dj = await dr.json();
      setDeals(dr.ok ? (dj.deals ?? []) : []);

      const tj = await tr.json();
      setTickets(tr.ok ? (tj.tickets ?? []) : []);

      const atj = await att.json();
      setAttachments(att.ok ? (atj.attachments ?? []) : []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to load");
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredActivities = useMemo(() => {
    let list = activities;
    if (activityTab === "notes") list = list.filter((a) => a.activity_type === "note");
    else if (activityTab !== "all") list = list.filter((a) => a.activity_type === activityTab);
    const q = activitySearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          (a.notes ?? "").toLowerCase().includes(q) ||
          (a.owner_name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [activities, activityTab, activitySearch]);

  const grouped = useMemo(() => groupByMonth(filteredActivities), [filteredActivities]);

  const submitNote = async (payload: {
    body: string;
    createFollowUpTask: boolean;
    followUpPreset: FollowUpPreset;
  }) => {
    setNoteSubmitting(true);
    try {
      const res = await fetch(`/api/sales/leads/${id}/activities`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_type: "note", notes: payload.body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");

      if (payload.createFollowUpTask) {
        const due = dueDateForPreset(payload.followUpPreset);
        const title = `Follow up: ${(lead?.lead_name as string) || "Lead"}`;
        const taskRes = await fetch("/api/sales/tasks", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: payload.body.slice(0, 2000),
            related_type: "lead",
            related_id: id,
            due_date: due,
            priority: "medium",
          }),
        });
        const tj = await taskRes.json();
        if (!taskRes.ok) throw new Error(tj.error || "Note saved but task failed");
      }

      message.success("Note added");
      setNoteOpen(false);
      void loadAll();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setNoteSubmitting(false);
    }
  };

  const saveLeadEdits = async () => {
    const values = await editForm.validateFields();
    setEditSaving(true);
    try {
      const payload = buildSalesLeadPayload(values as Record<string, unknown>);
      payload.assigned_to_id = (values as { assigned_to_id?: string | null }).assigned_to_id ?? null;
      const res = await fetch(`/api/sales/leads/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to save");
      message.success("Lead updated");
      setEditing(false);
      void loadAll();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  };

  const startEditing = () => {
    if (!lead) return;
    editForm.setFieldsValue(leadRecordToFormValues(lead as Record<string, unknown>));
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    editForm.resetFields();
  };

  const submitTicket = async () => {
    const v = await ticketForm.validateFields();
    setTicketSubmitting(true);
    try {
      const res = await fetch(`/api/sales/leads/${id}/tickets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      message.success("Ticket created");
      ticketForm.resetFields();
      setTicketOpen(false);
      void loadAll();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setTicketSubmitting(false);
    }
  };

  /** Generic quick-log: posts an activity of the given type then closes. */
  const logActivity = async (type: string, closeModal: () => void) => {
    const v = await logForm.validateFields();
    setLogSaving(true);
    try {
      const res = await fetch(`/api/sales/leads/${id}/activities`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: type,
          notes: (v.notes as string)?.trim() || null,
          activity_date: v.activity_date
            ? dayjs(v.activity_date as string).toISOString()
            : new Date().toISOString(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      message.success(`${type.charAt(0).toUpperCase() + type.slice(1)} logged`);
      logForm.resetFields();
      logForm.setFieldsValue({ activity_date: localNow() });
      closeModal();
      void loadAll();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLogSaving(false);
    }
  };

  const copyEmail = () => {
    if (!lead?.email) return;
    void navigator.clipboard.writeText(lead.email);
    message.success("Email copied");
  };

  const uploadProps = {
    maxCount: 1,
    showUploadList: false,
    beforeUpload: async (file: File) => {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/sales/leads/${id}/attachments`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Upload failed");
        message.success("File attached");
        void loadAll();
      } catch (e) {
        message.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
      return false;
    },
  };

  if (loading && !lead) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", background: PAGE_BG }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div style={{ padding: 48, textAlign: "center", background: PAGE_BG }}>
        <Title level={4}>Lead not found</Title>
        <Link href="/sales/leads">Back to leads</Link>
      </div>
    );
  }

  const roleLine = [lead.job_title, lead.company].filter(Boolean).join(" at ") || "—";

  const extraRecords = lead.account_id ? 1 : 0;

  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", padding: "16px 12px 48px" }}>
      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "0 8px" }}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push("/sales/leads")}>
            Leads
          </Button>
          {!editing ? (
            <Button type="primary" style={{ background: ACCENT, borderColor: ACCENT }} onClick={startEditing}>
              Edit lead
            </Button>
          ) : (
            <>
              <Button onClick={cancelEditing}>Cancel</Button>
              <Button type="primary" style={{ background: ACCENT, borderColor: ACCENT }} loading={editSaving} onClick={() => void saveLeadEdits()}>
                Save changes
              </Button>
            </>
          )}
        </Space>

        {editing ? (
          <>
            <Card
              title="Edit lead"
              styles={{ body: { padding: 24 } }}
              style={{ borderRadius: 12, border: "1px solid #e8eaed", marginBottom: 80 }}
            >
              <Form form={editForm} layout="vertical" initialValues={{ status: "new", lead_score: "lead" }}>
                <LeadFormFields mode="edit" leadId={id} agents={agents} ownerEditable />
              </Form>
            </Card>

            {/* Sticky save bar — buttons only, no panel */}
            <div
              style={{
                position: "fixed",
                bottom: 16,
                left: 0,
                right: 0,
                zIndex: 100,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 12,
                pointerEvents: "none",
              }}
            >
              <Space size={12} style={{ pointerEvents: "auto" }}>
                <Button onClick={cancelEditing}>Cancel</Button>
                <Button
                  type="primary"
                  style={{ background: ACCENT, borderColor: ACCENT, minWidth: 130 }}
                  loading={editSaving}
                  onClick={() => void saveLeadEdits()}
                >
                  Save changes
                </Button>
              </Space>
            </div>
          </>
        ) : null}

        <Row gutter={[16, 16]} style={{ display: editing ? "none" : undefined }}>
          {/* ── Left column ───────────────────────────────────────── */}
          <Col xs={24} lg={7} xl={6}>
            <Card
              styles={{ body: { padding: 20 } }}
              style={{ borderRadius: 12, border: "1px solid #e8eaed", marginBottom: 16 }}
            >
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <Avatar size={64} style={{ background: ACCENT, fontSize: 22, flexShrink: 0 }}>
                  {initials(lead.lead_name)}
                </Avatar>
                <div style={{ minWidth: 0 }}>
                  <Title level={4} style={{ margin: 0, fontSize: 20 }}>
                    {lead.lead_name || "Unnamed lead"}
                  </Title>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {roleLine}
                  </Text>
                  {lead.email && (
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <a href={`mailto:${lead.email}`} style={{ color: ACCENT, fontSize: 13 }}>
                        {lead.email}
                      </a>
                      <Button type="text" size="small" icon={<CopyOutlined />} onClick={copyEmail} aria-label="Copy email" />
                    </div>
                  )}
                  <div style={{ marginTop: lead.email ? 8 : 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {/* <PhoneOutlined style={{ fontSize: 13, color: "#94a3b8" }} /> */}
                    {lead.phone ? (
                      <a href={`tel:${lead.phone}`} style={{ color: ACCENT, fontSize: 13 }}>
                        {lead.phone}
                      </a>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        —
                      </Text>
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: "1px solid #f0f0f0",
                }}
              >
                <Button size="small" icon={<ProfileOutlined />} onClick={() => setNoteOpen(true)}>
                  Note
                </Button>
                <Button size="small" icon={<MailOutlined />} href={lead.email ? `mailto:${lead.email}` : undefined} disabled={!lead.email}>
                  Email
                </Button>
                <Button size="small" icon={<PhoneOutlined />} href={lead.phone ? `tel:${lead.phone}` : undefined} disabled={!lead.phone}>
                  Call
                </Button>
                <Button size="small" icon={<UnorderedListOutlined />} onClick={() => router.push("/sales/tasks")}>
                  Task
                </Button>
                <Button size="small" icon={<CalendarOutlined />} onClick={() => message.info("Schedule meetings from your calendar — link tasks from the Tasks page.")}>
                  Meeting
                </Button>
              </div>
            </Card>

            <Collapse
              defaultActiveKey={["key"]}
              items={[
                {
                  key: "key",
                  label: <span style={{ fontWeight: 600 }}>Key information</span>,
                  children: (
                    <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
                      <div>
                        <Text type="secondary">Lead status</Text>
                        <div>
                          <Tag color="blue">{STATUS_LABELS[lead.status] ?? lead.status}</Tag>
                        </div>
                      </div>
                      <div>
                        <Text type="secondary">Lifecycle stage</Text>
                        <div>{LIFECYCLE_LABELS[String(lead.lead_score ?? "")] ?? lead.lead_score ?? "—"}</div>
                      </div>
                      <div>
                        <Text type="secondary">Contact owner</Text>
                        <div>{lead.assigned_to_name ?? "—"}</div>
                      </div>
                      <div>
                        <Text type="secondary">Last contacted</Text>
                        <div>
                          {lead.last_contacted
                            ? dayjs(lead.last_contacted).format("MMM D, YYYY h:mm A")
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <Text type="secondary">Next follow-up</Text>
                        <div>
                          {lead.next_followup
                            ? `${dayjs(lead.next_followup).format("MMM D, YYYY")} · ${dayjs(lead.next_followup).fromNow()}`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <Text type="secondary">Budget</Text>
                        <div>{lead.budget || "—"}</div>
                      </div>
                      <div>
                        <Text type="secondary">Timeline</Text>
                        <div>{lead.purchase_timeline || "—"}</div>
                      </div>
                      <div>
                        <Text type="secondary">Lead source</Text>
                        <div>{lead.lead_source || "—"}</div>
                      </div>
                      <div>
                        <Text type="secondary">Country</Text>
                        <div>{lead.country || "—"}</div>
                      </div>
                    </div>
                  ),
                },
              ]}
              style={{ borderRadius: 12, border: "1px solid #e8eaed", background: "#fff" }}
            />
          </Col>

          {/* ── Center column ───────────────────────────────────────── */}
          <Col xs={24} lg={10} xl={12}>
            <Card
              styles={{ body: { padding: 0 } }}
              style={{ borderRadius: 12, border: "1px solid #e8eaed", overflow: "hidden" }}
            >
              <Tabs
                defaultActiveKey="activities"
                centered={false}
                tabBarStyle={{
                  margin: 0,
                  padding: "0 20px",
                  borderBottom: "1px solid #eef0f3",
                }}
                style={{ width: "100%" }}
                items={[
                  {
                    key: "about",
                    label: <span style={{ fontWeight: 600, fontSize: 14 }}>About</span>,
                    children: (
                      <div style={{ padding: "20px 20px 24px" }}>
                        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                          Overview of this lead. Use <strong>Edit lead</strong> to change fields.
                        </Paragraph>
                        <Row gutter={[16, 12]}>
                          <Col xs={24} sm={12}>
                            <Text type="secondary">Company</Text>
                            <div>{lead.company || "—"}</div>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Text type="secondary">Website</Text>
                            <div>
                              {lead.website ? (
                                <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer">
                                  {lead.website}
                                </a>
                              ) : (
                                "—"
                              )}
                            </div>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Text type="secondary">Phone</Text>
                            <div>{lead.phone || "—"}</div>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Text type="secondary">LinkedIn profile</Text>
                            <div>
                              <LinkedInLink value={lead.linkedin} />
                            </div>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Text type="secondary">Industry</Text>
                            <div>{lead.industry?.trim() || "—"}</div>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Text type="secondary">Company size (employees)</Text>
                            <div>{lead.company_size?.trim() || "—"}</div>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Text type="secondary">Annual revenue</Text>
                            <div>{lead.annual_revenue?.trim() || "—"}</div>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Text type="secondary">Created</Text>
                            <div>{dayjs(lead.created_at).format("MMM D, YYYY")}</div>
                          </Col>
                        </Row>
                      </div>
                    ),
                  },
                  {
                    key: "activities",
                    label: <span style={{ fontWeight: 600, fontSize: 14 }}>Activities</span>,
                    children: (
                      <ActivityFeed
                        activities={filteredActivities}
                        grouped={grouped}
                        activityTab={activityTab}
                        onTabChange={setActivityTab}
                        onSearchChange={setActivitySearch}
                        onNote={() => setNoteOpen(true)}
                        onCall={() => openLogModal(setLogCallOpen)}
                        onEmail={() => openLogModal(setLogEmailOpen)}
                        onTask={() => openLogModal(setLogTaskOpen)}
                        onMeeting={() => openLogModal(setLogMeetingOpen)}
                        accent={ACCENT}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          </Col>

          {/* ── Right column ───────────────────────────────────────── */}
          <Col xs={24} lg={7} xl={6}>
            <Card
              title={
                <Space>
                  <BankOutlined style={{ color: ACCENT }} />
                  <span>Companies</span>
                  <Tag>{lead.account_id ? 1 : 0}</Tag>
                </Space>
              }
              extra={
                lead.account_id ? (
                  <Link href={`/sales/accounts/${lead.account_id}`}>View</Link>
                ) : null
              }
              style={{ borderRadius: 12, marginBottom: 16, border: "1px solid #e8eaed" }}
            >
              {lead.account_id ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>
                      <Link href={`/sales/accounts/${lead.account_id}`} style={{ color: "#4f46e5" }}>
                        {(lead.company || lead.account_company_name || "Account").trim()}
                      </Link>
                    </div>
                    {lead.website && (
                      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                        {lead.website}
                      </Text>
                    )}
                  </div>
                  <Tag color="processing" style={{ flexShrink: 0, margin: 0 }}>
                    Primary
                  </Tag>
                </div>
              ) : (
                <Empty description="No linked account yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            <Card
              title={
                <Space>
                  <DollarOutlined style={{ color: ACCENT }} />
                  <span>Deals</span>
                  <Tag>{deals.length}</Tag>
                </Space>
              }
              extra={
                <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setDealOpen(true)}>
                  Add
                </Button>
              }
              style={{ borderRadius: 12, marginBottom: 16, border: "1px solid #e8eaed" }}
            >
              {deals.length === 0 ? (
                <Empty
                  description="Track revenue opportunities for this company."
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {deals.map((d) => (
                    <div key={d.id} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #eaf0f6", background: "#fafcfe" }}>
                      <Link href="/sales/deals" style={{ fontWeight: 600, color: "#4f46e5", fontSize: 14 }}>
                        {d.deal_name || "Deal"}
                      </Link>
                      {d.value != null && (
                        <div style={{ fontSize: 13, color: "#33475b", marginTop: 2 }}>
                          Amount: <strong>${d.value.toLocaleString("en-IN")}</strong>
                        </div>
                      )}
                      {d.expected_close_date && (
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          Close: {dayjs(d.expected_close_date).format("MMM D, YYYY")}
                        </div>
                      )}
                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        {d.priority && (
                          <Tag style={{ fontSize: 11, margin: 0 }}>{d.priority}</Tag>
                        )}
                        {d.pipeline && (
                          <Text type="secondary" style={{ fontSize: 12 }}>{d.pipeline}</Text>
                        )}
                        {d.stage && (
                          <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
                            {DEAL_STAGE_SELECT_OPTIONS.find((s) => s.value === d.stage)?.label ?? d.stage}
                          </Tag>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title={
                <Space>
                  <SafetyCertificateOutlined style={{ color: ACCENT }} />
                  <span>Tickets</span>
                  <Tag>{tickets.length}</Tag>
                </Space>
              }
              extra={
                <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setTicketOpen(true)}>
                  Add
                </Button>
              }
              style={{ borderRadius: 12, marginBottom: 16, border: "1px solid #e8eaed" }}
            >
              {tickets.length === 0 ? (
                <Empty description="Track customer requests for this lead." image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {tickets.map((t) => (
                    <li key={t.id} style={{ marginBottom: 8 }}>
                      <Text strong>{t.subject}</Text>
                      <div>
                        <Tag>{t.status}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {" "}
                          {dayjs(t.created_at).format("MMM D")}
                        </Text>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title={
                <Space>
                  <FileOutlined style={{ color: ACCENT }} />
                  <span>Attachments</span>
                  <Tag>{attachments.length}</Tag>
                </Space>
              }
              extra={
                <Upload {...uploadProps}>
                  <Button type="link" size="small" icon={<PlusOutlined />} loading={uploading}>
                    Add
                  </Button>
                </Upload>
              }
              style={{ borderRadius: 12, border: "1px solid #e8eaed" }}
            >
              {attachments.length === 0 ? (
                <Empty description="Upload files to keep context in one place." image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {attachments.map((f) => (
                    <li key={f.id} style={{ marginBottom: 8 }}>
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noreferrer">
                          {f.file_name}
                        </a>
                      ) : (
                        <span>{f.file_name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Col>
        </Row>
      </div>

      <LeadNoteModal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        leadDisplayName={(lead.lead_name as string) || "Lead"}
        extraRecordCount={extraRecords}
        submitting={noteSubmitting}
        onSubmit={submitNote}
      />

      <NewDealDrawer
        open={dealOpen}
        onClose={() => setDealOpen(false)}
        onCreated={() => void loadAll()}
        defaultAccountId={lead?.account_id ?? null}
        defaultLeadId={id}
      />

      <Modal
        title="New ticket"
        open={ticketOpen}
        onCancel={() => setTicketOpen(false)}
        onOk={submitTicket}
        confirmLoading={ticketSubmitting}
        destroyOnClose
      >
        <Form form={ticketForm} layout="vertical" initialValues={{ priority: "medium" }}>
          <Form.Item name="subject" label="Subject" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="priority" label="Priority">
            <Select
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Quick-log: Call ── */}
      <Modal
        title={<Space><PhoneOutlined style={{ color: "#4f46e5" }} /><span>Log a call</span></Space>}
        open={logCallOpen}
        onCancel={() => setLogCallOpen(false)}
        onOk={() => void logActivity("call", () => setLogCallOpen(false))}
        confirmLoading={logSaving}
        okText="Log call"
        okButtonProps={{ style: { background: "#4f46e5", borderColor: "#4f46e5" } }}
        destroyOnClose
      >
        <Form form={logForm} layout="vertical">
          <Form.Item name="notes" label="Call notes">
            <Input.TextArea rows={3} placeholder="What was discussed on the call?" />
          </Form.Item>
          <Form.Item name="activity_date" label="Date & time">
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Quick-log: Email ── */}
      <Modal
        title={<Space><MailOutlined style={{ color: "#0891b2" }} /><span>Log an email</span></Space>}
        open={logEmailOpen}
        onCancel={() => setLogEmailOpen(false)}
        onOk={() => void logActivity("email", () => setLogEmailOpen(false))}
        confirmLoading={logSaving}
        okText="Log email"
        okButtonProps={{ style: { background: "#0891b2", borderColor: "#0891b2" } }}
        destroyOnClose
      >
        <Form form={logForm} layout="vertical">
          <Form.Item name="notes" label="Email summary">
            <Input.TextArea rows={3} placeholder="Summary of the email sent or received..." />
          </Form.Item>
          <Form.Item name="activity_date" label="Date & time">
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Quick-log: Task ── */}
      <Modal
        title={<Space><UnorderedListOutlined style={{ color: "#4f46e5" }} /><span>Create a task</span></Space>}
        open={logTaskOpen}
        onCancel={() => setLogTaskOpen(false)}
        onOk={() => void logActivity("task", () => setLogTaskOpen(false))}
        confirmLoading={logSaving}
        okText="Create task"
        okButtonProps={{ style: { background: "#4f46e5", borderColor: "#4f46e5" } }}
        destroyOnClose
      >
        <Form form={logForm} layout="vertical">
          <Form.Item name="notes" label="Task description" rules={[{ required: true, message: "Enter a task description" }]}>
            <Input.TextArea rows={3} placeholder="What needs to be done?" />
          </Form.Item>
          <Form.Item name="activity_date" label="Due date">
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Quick-log: Meeting ── */}
      <Modal
        title={<Space><CalendarOutlined style={{ color: "#7c3aed" }} /><span>Log a meeting</span></Space>}
        open={logMeetingOpen}
        onCancel={() => setLogMeetingOpen(false)}
        onOk={() => void logActivity("meeting", () => setLogMeetingOpen(false))}
        confirmLoading={logSaving}
        okText="Log meeting"
        okButtonProps={{ style: { background: "#7c3aed", borderColor: "#7c3aed" } }}
        destroyOnClose
      >
        <Form form={logForm} layout="vertical">
          <Form.Item name="notes" label="Meeting notes">
            <Input.TextArea rows={3} placeholder="What was covered in the meeting?" />
          </Form.Item>
          <Form.Item name="activity_date" label="Date & time">
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/* ─── ActivityFeed sub-component ─────────────────────────────────────────── */

type ActivityFeedProps = {
  activities: TimelineItem[];
  grouped: Map<string, TimelineItem[]>;
  activityTab: string;
  onTabChange: (k: string) => void;
  onSearchChange: (v: string) => void;
  onNote: () => void;
  onCall: () => void;
  onEmail: () => void;
  onTask: () => void;
  onMeeting: () => void;
  accent: string;
};

function ActivityFeed({
  activities,
  grouped,
  activityTab,
  onTabChange,
  onSearchChange,
  onNote,
  onCall,
  onEmail,
  onTask,
  onMeeting,
  accent,
}: ActivityFeedProps) {
  const ACTION_BTN_STYLES: Record<string, React.CSSProperties> = {
    all:     { background: accent,    borderColor: accent },
    notes:   { background: accent,    borderColor: accent },
    call:    { background: "#4f46e5", borderColor: "#4f46e5" },
    email:   { background: "#0891b2", borderColor: "#0891b2" },
    task:    { background: "#4f46e5", borderColor: "#4f46e5" },
    meeting: { background: "#7c3aed", borderColor: "#7c3aed" },
  };

  const ACTION_CONFIG: Record<string, { icon: React.ReactNode; label: string; onClick: () => void }> = {
    all:     { icon: <PlusOutlined />,            label: "Create note",   onClick: onNote },
    notes:   { icon: <PlusOutlined />,            label: "Create note",   onClick: onNote },
    call:    { icon: <PhoneOutlined />,           label: "Log call",      onClick: onCall },
    email:   { icon: <MailOutlined />,            label: "Log email",     onClick: onEmail },
    task:    { icon: <UnorderedListOutlined />,   label: "Create task",   onClick: onTask },
    meeting: { icon: <CalendarOutlined />,        label: "Log meeting",   onClick: onMeeting },
  };

  const action = ACTION_CONFIG[activityTab] ?? ACTION_CONFIG.all;
  const btnStyle = ACTION_BTN_STYLES[activityTab] ?? ACTION_BTN_STYLES.all;

  return (
    <div>
      {/* Inner sub-tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          borderBottom: "1px solid #f0f2f5",
          background: "#fafbfc",
          flexWrap: "wrap",
          gap: 8,
          minHeight: 44,
        }}
      >
        <div style={{ display: "flex", gap: 0 }}>
          {[
            { k: "all",     label: "All" },
            { k: "notes",   label: "Notes" },
            { k: "call",    label: "Calls" },
            { k: "email",   label: "Emails" },
            { k: "task",    label: "Tasks" },
            { k: "meeting", label: "Meetings" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => onTabChange(t.k)}
              style={{
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: activityTab === t.k ? 600 : 400,
                color: activityTab === t.k ? accent : "#64748b",
                background: "none",
                border: "none",
                borderBottom: activityTab === t.k ? `2px solid ${accent}` : "2px solid transparent",
                cursor: "pointer",
                transition: "all .15s",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button
          size="small"
          type="primary"
          icon={action.icon}
          style={{ ...btnStyle, borderRadius: 6, flexShrink: 0 }}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      </div>

      {/* Search + list */}
      <div style={{ padding: "14px 20px 24px" }}>
        <Input.Search
          placeholder="Search activities"
          allowClear
          style={{ marginBottom: 14 }}
          onChange={(e) => onSearchChange(e.target.value)}
        />

        {activities.length === 0 ? (
          <Empty description="No activities yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div>
            {[...grouped.entries()].map(([month, list]) => (
              <div key={month} style={{ marginBottom: 24 }}>
                <Text strong style={{ color: "#64748b", fontSize: 12, letterSpacing: "0.04em" }}>
                  {month.toUpperCase()}
                </Text>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {list.map((a) => {
                    const meta = TYPE_META[a.activity_type] ?? { label: a.activity_type, color: "#64748b" };
                    return (
                      <Card
                        key={a.id}
                        size="small"
                        style={{
                          borderRadius: 8,
                          border: "1px solid #eaf0f6",
                          background: a.activity_type === "note" ? "#fafcfe" : "#fff",
                          boxShadow: "none",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0, marginTop: 6 }} />
                            <div>
                              <Text strong style={{ fontSize: 14, color: "#33475b" }}>
                                {a.activity_type === "note" ? `Note from ${a.owner_name ?? "User"}` : meta.label}
                              </Text>
                              {a.owner_name && a.activity_type !== "note" && (
                                <div>
                                  <Text type="secondary" style={{ fontSize: 12 }}>by {a.owner_name}</Text>
                                </div>
                              )}
                            </div>
                          </div>
                          <Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                            {dayjs(a.activity_date).format("MMM D, YYYY · h:mm A")}
                          </Text>
                        </div>
                        {a.notes && (
                          <Paragraph style={{ margin: "10px 0 0 16px", whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55, color: "#2d3e50" }}>
                            {a.notes}
                          </Paragraph>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
