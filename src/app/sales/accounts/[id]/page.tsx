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
  Row,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ArrowLeftOutlined,
  BankOutlined,
  CalendarOutlined,
  CopyOutlined,
  DollarOutlined,
  GlobalOutlined,
  MailOutlined,
  PhoneOutlined,
  PlusOutlined,
  ProfileOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { LeadNoteModal, dueDateForPreset, type FollowUpPreset } from "@/components/Sales/LeadNoteModal";
import { NewDealDrawer } from "@/components/Sales/NewDealDrawer";
import { DEAL_STAGE_SELECT_OPTIONS } from "@/constants/salesDealStages";
import { LEAD_STATUS_OPTIONS } from "@/constants/salesLeadForm";

dayjs.extend(relativeTime);

const ACCENT = "#0d9488";
const PAGE_BG = "#f3f5f7";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type AccountDetail = {
  id: string;
  company_name: string | null;
  industry: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  updated_at: string | null;
};

type ActivityItem = {
  id: string;
  activity_type: string;
  related_to_type: string;
  related_to_id: string;
  related_lead_name: string | null;
  notes: string | null;
  activity_date: string;
  owner_name: string | null;
};

type LeadLite = {
  id: string;
  lead_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  status: string;
  lead_score: string | null;
  assigned_to_name: string | null;
  created_at: string;
};

type DealLite = {
  id: string;
  deal_name: string | null;
  value: number | null;
  stage: string | null;
  owner_name: string | null;
  expected_close_date: string | null;
  created_at: string;
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  new: "blue", open: "cyan", in_progress: "processing", open_deal: "purple",
  unqualified: "red", attempted_to_contact: "orange", connected: "green",
  bad_timing: "default", converted: "purple",
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

const ACTIVITY_TABS = [
  { k: "all", label: "Activity" },
  { k: "note", label: "Notes" },
  { k: "email", label: "Emails" },
  { k: "call", label: "Calls" },
  { k: "task", label: "Tasks" },
  { k: "meeting", label: "Meetings" },
] as const;

function initials(name: string | null) {
  if (!name?.trim()) return "?";
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

function groupByMonth(items: ActivityItem[]) {
  const map = new Map<string, ActivityItem[]>();
  for (const it of items) {
    const key = dayjs(it.activity_date).format("MMMM YYYY");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  return map;
}

const { Title, Text, Paragraph } = Typography;

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [deals, setDeals] = useState<DealLite[]>([]);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const [dealOpen, setDealOpen] = useState(false);

  const [activityTab, setActivityTab] = useState<string>("all");
  const [activitySearch, setActivitySearch] = useState("");

  /* ── edit state ── */
  const [editing, setEditing] = useState(false);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);

  /* ── load ── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ar, lr, dr, accR] = await Promise.all([
        fetch(`/api/sales/accounts/${id}/activities`, { credentials: "include" }),
        fetch(`/api/sales/accounts/${id}/leads`, { credentials: "include" }),
        fetch(`/api/sales/accounts/${id}/deals`, { credentials: "include" }),
        fetch(`/api/sales/accounts/${id}`, { credentials: "include" }),
      ]);

      const accJ = await accR.json();
      if (!accR.ok) throw new Error(accJ.error || "Failed to load account");
      setAccount(accJ.account as AccountDetail);

      const aj = await ar.json();
      setActivities(ar.ok ? (aj.activities ?? []) : []);

      const lj = await lr.json();
      setLeads(lr.ok ? (lj.leads ?? []) : []);

      const dj = await dr.json();
      setDeals(dr.ok ? (dj.deals ?? []) : []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to load");
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  /* ── filtered activities ── */
  const filteredActivities = useMemo(() => {
    let list = activities;
    if (activityTab !== "all") list = list.filter((a) => a.activity_type === activityTab);
    const q = activitySearch.trim().toLowerCase();
    if (q) list = list.filter((a) =>
      (a.notes ?? "").toLowerCase().includes(q) ||
      (a.owner_name ?? "").toLowerCase().includes(q) ||
      (a.related_lead_name ?? "").toLowerCase().includes(q)
    );
    return list;
  }, [activities, activityTab, activitySearch]);

  const grouped = useMemo(() => groupByMonth(filteredActivities), [filteredActivities]);

  /* ── note submit ── */
  const submitNote = async (payload: { body: string; createFollowUpTask: boolean; followUpPreset: FollowUpPreset }) => {
    setNoteSubmitting(true);
    try {
      const res = await fetch(`/api/sales/accounts/${id}/activities`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_type: "note", notes: payload.body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");

      if (payload.createFollowUpTask) {
        const due = dueDateForPreset(payload.followUpPreset);
        await fetch("/api/sales/tasks", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Follow up: ${account?.company_name || "Account"}`,
            description: payload.body.slice(0, 2000),
            related_type: "account",
            related_id: id,
            due_date: due,
            priority: "medium",
          }),
        });
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

  /* ── save account edits ── */
  const saveEdits = async () => {
    const v = await editForm.validateFields() as Record<string, unknown>;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/sales/accounts/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: v.company_name || null,
          industry: v.industry || null,
          website: v.website || null,
          phone: v.phone || null,
          address: v.address || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      message.success("Account updated");
      setEditing(false);
      void loadAll();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setEditSaving(false);
    }
  };

  const startEditing = () => {
    if (!account) return;
    editForm.setFieldsValue({
      company_name: account.company_name ?? "",
      industry: account.industry ?? "",
      website: account.website ?? "",
      phone: account.phone ?? "",
      address: account.address ?? "",
    });
    setEditing(true);
  };

  /* ── loading / not found ── */
  if (loading && !account) {
    return (
      <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", background: PAGE_BG }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!account) {
    return (
      <div style={{ padding: 48, textAlign: "center", background: PAGE_BG }}>
        <Title level={4}>Account not found</Title>
        <Link href="/sales/accounts">Back to accounts</Link>
      </div>
    );
  }

  const websiteHref = account.website
    ? account.website.startsWith("http") ? account.website : `https://${account.website}`
    : null;

  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", padding: "16px 12px 48px" }}>
      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "0 8px" }}>
        {/* ── Top bar ── */}
        <Space style={{ marginBottom: 16 }} wrap>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push("/sales/accounts")}>
            Accounts
          </Button>
          {!editing ? (
            <Button type="primary" style={{ background: ACCENT, borderColor: ACCENT }} onClick={startEditing}>
              Edit account
            </Button>
          ) : (
            <>
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="primary" style={{ background: ACCENT, borderColor: ACCENT }} loading={editSaving} onClick={() => void saveEdits()}>
                Save changes
              </Button>
            </>
          )}
        </Space>

        {/* ── Inline edit form ── */}
        {editing && (
          <Card
            title="Edit account"
            styles={{ body: { padding: 24 } }}
            style={{ borderRadius: 12, border: "1px solid #e8eaed", marginBottom: 24 }}
          >
            <Form form={editForm} layout="vertical">
              <Row gutter={20}>
                <Col xs={24} lg={12}>
                  <Form.Item name="company_name" label="Company name" rules={[{ required: true, message: "Required" }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="industry" label="Industry">
                    <Input />
                  </Form.Item>
                  <Form.Item name="phone" label="Phone">
                    <Input placeholder="+1 (555) 000-0000" />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={12}>
                  <Form.Item name="website" label="Website">
                    <Input placeholder="https://company.com" />
                  </Form.Item>
                  <Form.Item name="address" label="Address">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Card>
        )}

        <Row gutter={[16, 16]} style={{ display: editing ? "none" : undefined }}>
          {/* ── Left column ── */}
          <Col xs={24} lg={6} xl={5}>
            <Card styles={{ body: { padding: 20 } }} style={{ borderRadius: 12, border: "1px solid #e8eaed", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <Avatar size={60} style={{ background: ACCENT, fontSize: 22, flexShrink: 0 }}>
                  {initials(account.company_name)}
                </Avatar>
                <div style={{ minWidth: 0 }}>
                  <Title level={4} style={{ margin: 0, fontSize: 19, lineHeight: 1.3 }}>
                    {account.company_name || "Unnamed"}
                  </Title>
                  {account.industry && (
                    <Text type="secondary" style={{ fontSize: 13 }}>{account.industry}</Text>
                  )}
                  {websiteHref && (
                    <div style={{ marginTop: 6 }}>
                      <a href={websiteHref} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                        <GlobalOutlined style={{ fontSize: 12 }} />
                        {account.website}
                      </a>
                    </div>
                  )}
                  {account.phone && (
                    <div style={{ marginTop: 4 }}>
                      <a href={`tel:${account.phone}`} style={{ color: "#64748b", fontSize: 13 }}>
                        {account.phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick action buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20, paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
                <Button size="small" icon={<ProfileOutlined />} onClick={() => setNoteOpen(true)}>Note</Button>
                <Button size="small" icon={<MailOutlined />} href={`mailto:`} disabled={!leads.find((l) => l.email)}>Email</Button>
                <Button size="small" icon={<PhoneOutlined />} href={account.phone ? `tel:${account.phone}` : undefined} disabled={!account.phone}>Call</Button>
                <Button size="small" icon={<UnorderedListOutlined />} onClick={() => router.push("/sales/tasks")}>Task</Button>
                <Button size="small" icon={<CalendarOutlined />} onClick={() => message.info("Schedule from the Tasks page.")}>Meeting</Button>
              </div>
            </Card>

            {/* Key info collapse */}
            <Collapse
              defaultActiveKey={["key"]}
              items={[
                {
                  key: "key",
                  label: <span style={{ fontWeight: 600 }}>Key information</span>,
                  children: (
                    <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
                      <div>
                        <Text type="secondary">Company owner</Text>
                        <div>{account.owner_name || "No owner"}</div>
                      </div>
                      {account.industry && (
                        <div>
                          <Text type="secondary">Industry</Text>
                          <div>{account.industry}</div>
                        </div>
                      )}
                      {account.phone && (
                        <div>
                          <Text type="secondary">Phone</Text>
                          <div>{account.phone}</div>
                        </div>
                      )}
                      {account.address && (
                        <div>
                          <Text type="secondary">Address</Text>
                          <div>{account.address}</div>
                        </div>
                      )}
                      <div>
                        <Text type="secondary">Created</Text>
                        <div>{dayjs(account.created_at).format("MMM D, YYYY")}</div>
                      </div>
                      <div>
                        <Text type="secondary">Associated leads</Text>
                        <div>{leads.length}</div>
                      </div>
                      <div>
                        <Text type="secondary">Deals</Text>
                        <div>{deals.length}</div>
                      </div>
                    </div>
                  ),
                },
              ]}
              style={{ borderRadius: 12, border: "1px solid #e8eaed", background: "#fff" }}
            />
          </Col>

          {/* ── Center column: Activity tabs ── */}
          <Col xs={24} lg={12} xl={13}>
            <Card
              styles={{ body: { padding: 0 } }}
              style={{ borderRadius: 12, border: "1px solid #e8eaed", overflow: "hidden" }}
            >
              <Tabs
                defaultActiveKey="all"
                tabBarStyle={{ margin: 0, padding: "0 20px", borderBottom: "1px solid #eef0f3" }}
                style={{ width: "100%" }}
                onChange={setActivityTab}
                items={ACTIVITY_TABS.map((t) => ({
                  key: t.k,
                  label: <span style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</span>,
                  children: (
                    <div style={{ padding: "16px 20px 24px" }}>
                      {/* Search + filter count */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                        <Input.Search
                          placeholder="Search activities..."
                          allowClear
                          style={{ maxWidth: 320 }}
                          onChange={(e) => setActivitySearch(e.target.value)}
                        />
                        {activityTab !== "all" && (
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            {filteredActivities.length} {activityTab}{filteredActivities.length === 1 ? "" : "s"}
                          </Text>
                        )}
                      </div>

                      {filteredActivities.length === 0 ? (
                        <Empty
                          description={`No ${activityTab === "all" ? "activities" : activityTab + "s"} yet`}
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                        />
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
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0, marginTop: 6 }} />
                                          <div>
                                            <Text strong style={{ fontSize: 14, color: "#33475b" }}>
                                              {a.activity_type === "note"
                                                ? `Note from ${a.owner_name ?? "User"}`
                                                : meta.label}
                                            </Text>
                                            {a.related_lead_name && (
                                              <div>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                  via{" "}
                                                  <Link
                                                    href={`/sales/leads/${a.related_to_id}`}
                                                    style={{ color: ACCENT }}
                                                  >
                                                    {a.related_lead_name}
                                                  </Link>
                                                </Text>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                                          {dayjs(a.activity_date).format("MMM D, YYYY · h:mm A")}
                                        </Text>
                                      </div>
                                      {a.notes && (
                                        <Paragraph
                                          style={{ margin: "10px 0 0 16px", whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55, color: "#2d3e50" }}
                                        >
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
                  ),
                }))}
              />
            </Card>
          </Col>

          {/* ── Right column: Leads + Deals ── */}
          <Col xs={24} lg={6} xl={6}>
            {/* Leads / Contacts */}
            <Card
              title={
                <Space>
                  <UserOutlined style={{ color: ACCENT }} />
                  <span>Leads</span>
                  <Tag>{leads.length}</Tag>
                </Space>
              }
              extra={
                <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => router.push(`/sales/leads/new`)}>
                  Add
                </Button>
              }
              style={{ borderRadius: 12, marginBottom: 16, border: "1px solid #e8eaed" }}
              styles={{ body: { padding: leads.length === 0 ? 24 : "8px 16px 16px" } }}
            >
              {leads.length === 0 ? (
                <Empty description="No leads linked to this account." image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {leads.map((l) => (
                    <div
                      key={l.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #eaf0f6",
                        background: "#fafcfe",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <Link href={`/sales/leads/${l.id}`} style={{ fontWeight: 600, color: "#4f46e5", fontSize: 14 }}>
                          {l.lead_name}
                        </Link>
                        <Tag color={STATUS_COLORS[l.status] ?? "default"} style={{ margin: 0, fontSize: 11 }}>
                          {LEAD_STATUS_OPTIONS.find((o) => o.value === l.status)?.label ?? l.status}
                        </Tag>
                      </div>
                      {(l.job_title || account.company_name) && (
                        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 2 }}>
                          {[l.job_title, account.company_name].filter(Boolean).join(" at ")}
                        </Text>
                      )}
                      {l.email && (
                        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                          <MailOutlined style={{ fontSize: 11, color: "#64748b" }} />
                          <a href={`mailto:${l.email}`} style={{ fontSize: 12, color: "#64748b" }}>{l.email}</a>
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined style={{ fontSize: 10 }} />}
                            style={{ padding: "0 4px", height: 16 }}
                            onClick={() => { void navigator.clipboard.writeText(l.email!); message.success("Copied"); }}
                          />
                        </div>
                      )}
                      {l.phone && (
                        <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
                          <PhoneOutlined style={{ fontSize: 11, color: "#64748b" }} />
                          <a href={`tel:${l.phone}`} style={{ fontSize: 12, color: "#64748b" }}>{l.phone}</a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Deals */}
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
              style={{ borderRadius: 12, border: "1px solid #e8eaed" }}
              styles={{ body: { padding: deals.length === 0 ? 24 : "8px 16px 16px" } }}
            >
              {deals.length === 0 ? (
                <Empty description="No deals for this account yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
                      {d.stage && (
                        <div style={{ marginTop: 4 }}>
                          <Tag style={{ fontSize: 11, margin: 0 }}>
                            {DEAL_STAGE_SELECT_OPTIONS.find((s) => s.value === d.stage)?.label ?? d.stage}
                          </Tag>
                        </div>
                      )}
                      {d.expected_close_date && (
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                          Close: {dayjs(d.expected_close_date).format("MMM D, YYYY")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </div>

      {/* ── Note modal ── */}
      <LeadNoteModal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        leadDisplayName={account.company_name || "Account"}
        submitting={noteSubmitting}
        onSubmit={submitNote}
      />

      <NewDealDrawer
        open={dealOpen}
        onClose={() => setDealOpen(false)}
        onCreated={() => void loadAll()}
        defaultAccountId={id}
      />
    </div>
  );
}

