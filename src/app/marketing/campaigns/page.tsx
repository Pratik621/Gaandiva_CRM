"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Typography,
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  message,
  Popconfirm,
  Space,
  Tooltip,
  DatePicker,
  // Upload, // TODO: re-enable once the sm_agent INSERT RLS policy is applied
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  LinkOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
  DownloadOutlined,
  FacebookOutlined,
  // UploadOutlined, InboxOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { getPropertyValue, formatPhone, getLeadSourceInfo } from "@/lib/marketing/lead-fields";
import type { MetaTokenCheck } from "@/lib/marketing/meta-token-check";
import MetaTokenCheckResult from "@/components/Marketing/MetaTokenCheckResult";
// import { parseLeadsExcelFile, type ParsedLeadRow } from "@/lib/marketing/leads-import-parse"; // TODO: re-enable with Import

const { Title, Text } = Typography;

type LeadStatus = "new" | "follow_up" | "in_progress" | "closed";

interface FlatLead {
  id: string;
  name: string | null;
  phone: string | null;
  status: LeadStatus;
  raw_data: Record<string, string>;
  simplified_campaign_id: string;
  simplified_campaigns: { name: string } | null;
  source: string | null;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New / Not Contacted" },
  { value: "follow_up", label: "Follow-up Due" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

// Quick ranges for the "Received date" filter.
const DATE_PRESETS: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: "Today", value: [dayjs().startOf("day"), dayjs().endOf("day")] },
  { label: "Yesterday", value: [dayjs().subtract(1, "day").startOf("day"), dayjs().subtract(1, "day").endOf("day")] },
  { label: "Last 7 days", value: [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")] },
  { label: "Last 30 days", value: [dayjs().subtract(29, "day").startOf("day"), dayjs().endOf("day")] },
  { label: "This month", value: [dayjs().startOf("month"), dayjs().endOf("day")] },
  { label: "Last month", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
];

const DATE_PARAM_FORMAT = "YYYY-MM-DD";

const statusColors: Record<LeadStatus, string> = {
  new: "gold",
  follow_up: "orange",
  in_progress: "blue",
  closed: "green",
};

interface AdSource {
  id: string;
  sheet_url: string;
  label: string | null;
  status: "active" | "paused";
  last_synced_at: string | null;
  last_sync_status: "success" | "error" | null;
  last_sync_error: string | null;
  last_sync_rows: number | null;
}

interface MetaSource {
  id: string;
  label: string | null;
  /** null = status-updates-only token (can't read leads). */
  page_id: string | null;
  page_name: string | null;
  dataset_id: string | null;
  status: "active" | "paused";
  token_hint: string | null;
  last_synced_at: string | null;
  last_sync_status: "success" | "error" | null;
  last_sync_error: string | null;
  last_sync_leads: number | null;
  last_sync_duplicates: number | null;
  last_sync_forms: number | null;
  last_sync_errors: number | null;
  discovered_forms: MetaFormResult[];
}

interface MetaFormResult {
  id: string;
  name: string | null;
  status: string | null;
  leads_read: number;
  imported: number;
  duplicates: number;
  error: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  displayName: string;
  external_campaign_id: string | null;
  status: string;
  leadCounts: { new: number; follow_up: number; in_progress: number; closed: number; total: number };
}

export default function MarketingCampaignsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") as LeadStatus | null;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  // Picked days (YYYY-MM-DD in the URL) → exact start/end-of-day timestamps in
  // the user's own timezone, sent to the APIs as ISO strings.
  const dateRange = useMemo<[Dayjs, Dayjs] | null>(() => {
    const from = fromParam ? dayjs(fromParam) : null;
    const to = toParam ? dayjs(toParam) : null;
    return from?.isValid() && to?.isValid() ? [from, to] : null;
  }, [fromParam, toParam]);
  const dateQuery = useMemo(
    () =>
      dateRange
        ? `from=${encodeURIComponent(dateRange[0].startOf("day").toISOString())}&to=${encodeURIComponent(
            dateRange[1].endOf("day").toISOString()
          )}`
        : "",
    [dateRange]
  );
  const dateRangeLabel = dateRange
    ? ` · ${dateRange[0].format("DD MMM YYYY")} – ${dateRange[1].format("DD MMM YYYY")}`
    : "";

  const [adSources, setAdSources] = useState<AdSource[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignSubmitting, setCampaignSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [campaignForm] = Form.useForm();

  const [metaSources, setMetaSources] = useState<MetaSource[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [metaConnecting, setMetaConnecting] = useState(false);
  const [metaForm] = Form.useForm();
  const [tokenCheck, setTokenCheck] = useState<MetaTokenCheck | null>(null);
  const [checkingMetaId, setCheckingMetaId] = useState<string | null>(null);

  const [flatLeads, setFlatLeads] = useState<FlatLead[]>([]);
  const [flatLoading, setFlatLoading] = useState(false);

  // Import disabled for now — see the commented Import button/modal below.
  // const [importOpen, setImportOpen] = useState(false);
  // const [importing, setImporting] = useState(false);
  // const [importCampaignId, setImportCampaignId] = useState<string | undefined>(undefined);
  // const [parsedLeads, setParsedLeads] = useState<ParsedLeadRow[]>([]);

  const loadFlatLeads = useCallback(async (status: LeadStatus) => {
    setFlatLoading(true);
    try {
      const res = await fetch(`/api/marketing/leads?status=${status}${dateQuery ? `&${dateQuery}` : ""}`);
      const json = await res.json();
      if (res.ok) setFlatLeads(json.leads ?? []);
    } finally {
      setFlatLoading(false);
    }
  }, [dateQuery]);

  useEffect(() => {
    if (statusFilter) loadFlatLeads(statusFilter);
  }, [statusFilter, loadFlatLeads]);

  const updateFilters = (next: { status?: LeadStatus | null; range?: [Dayjs, Dayjs] | null }) => {
    const params = new URLSearchParams();
    const status = next.status !== undefined ? next.status : statusFilter;
    const range = next.range !== undefined ? next.range : dateRange;
    if (status) params.set("status", status);
    if (range) {
      params.set("from", range[0].format(DATE_PARAM_FORMAT));
      params.set("to", range[1].format(DATE_PARAM_FORMAT));
    }
    const qs = params.toString();
    router.push(`/marketing/campaigns${qs ? `?${qs}` : ""}`);
  };

  const setStatusFilter = (status: LeadStatus | undefined) => updateFilters({ status: status ?? null });

  const loadAdSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const res = await fetch("/api/marketing/ad-sources");
      const json = await res.json();
      if (res.ok) setAdSources(json.adSources ?? []);
    } finally {
      setLoadingSources(false);
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const res = await fetch(`/api/marketing/campaigns${dateQuery ? `?${dateQuery}` : ""}`);
      const json = await res.json();
      if (res.ok) setCampaigns(json.campaigns ?? []);
    } finally {
      setLoadingCampaigns(false);
    }
  }, [dateQuery]);

  const loadMetaSources = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const res = await fetch("/api/marketing/meta-sources");
      const json = await res.json();
      if (res.ok) setMetaSources(json.metaSources ?? []);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    loadAdSources();
    loadCampaigns();
    loadMetaSources();
  }, [loadAdSources, loadCampaigns, loadMetaSources]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/marketing/ad-sources/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.error || "Sync failed");
        return;
      }
      const failed = (json.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      const totalLeads = (json.results ?? []).reduce(
        (sum: number, r: { leadsInserted?: number }) => sum + (r.leadsInserted ?? 0),
        0
      );
      const meta = json.meta as
        | { imported: number; skipped_duplicates: number; forms_processed: number; errors: number }
        | undefined;
      const metaSummary =
        meta && meta.forms_processed > 0
          ? ` · Meta: ${meta.imported} imported, ${meta.skipped_duplicates} duplicate(s) skipped, ${meta.forms_processed} form(s)`
          : "";
      if (failed.length > 0) {
        message.warning(`Synced with ${failed.length} error(s) — check the sync status below${metaSummary}`);
      } else {
        message.success(
          (totalLeads > 0 ? `Synced — ${totalLeads} new lead(s) added` : "Synced — no new leads") + metaSummary
        );
      }
      await Promise.all([loadAdSources(), loadCampaigns(), loadMetaSources()]);
      if (statusFilter) await loadFlatLeads(statusFilter);
    } catch {
      message.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddUrl = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res = await fetch("/api/marketing/ad-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet_url: values.sheet_url, label: values.label }),
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.error || "Could not add URL");
        return;
      }
      message.success("Advertise URL added — it will sync automatically within 30 minutes");
      form.resetFields();
      setModalOpen(false);
      loadAdSources();
    } catch {
      // validation error, ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUrl = async (id: string) => {
    const res = await fetch(`/api/marketing/ad-sources/${id}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Advertise URL removed");
      loadAdSources();
    } else {
      message.error("Could not remove URL");
    }
  };

  const handleConnectMeta = async () => {
    try {
      const values = await metaForm.validateFields();
      setMetaConnecting(true);
      const res = await fetch("/api/marketing/meta-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: values.access_token,
          page_id: values.page_id,
          dataset_id: values.dataset_id,
          label: values.label,
        }),
      });
      const json = await res.json();
      if (json.check) setTokenCheck(json.check);
      if (!res.ok) {
        message.error(json.error || "Could not connect Meta");
        return;
      }
      if (json.mode === "status_only") {
        message.success("Connected for status updates only — this token can't read lead data");
      } else if (json.sync?.ok) {
        message.success(
          `Connected — ${json.sync.imported} lead(s) imported, ${json.sync.skipped_duplicates} duplicate(s) skipped from ${json.sync.forms_processed} form(s)`
        );
      } else {
        message.warning(`Connected, but the first sync failed: ${json.sync?.error || "unknown error"}`);
      }
      metaForm.resetFields();
      setMetaModalOpen(false);
      await Promise.all([loadMetaSources(), loadCampaigns()]);
    } catch {
      // validation error, ignore
    } finally {
      setMetaConnecting(false);
    }
  };

  const handleCheckMeta = async (id: string) => {
    setCheckingMetaId(id);
    try {
      const res = await fetch(`/api/marketing/meta-sources/${id}/check`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.error || "Could not check token");
        return;
      }
      setTokenCheck(json.check);
      if (json.pageUpdate) {
        message.success(
          json.pageUpdate.from
            ? `Page ID corrected: ${json.pageUpdate.from} → ${json.pageUpdate.to}. Click Refresh to sync leads.`
            : `Page ${json.pageUpdate.to} connected for lead sync. Click Refresh to sync leads.`
        );
        loadMetaSources();
      } else if (json.pageUpdateError) {
        message.error(json.pageUpdateError);
      }
    } catch {
      message.error("Could not check token");
    } finally {
      setCheckingMetaId(null);
    }
  };

  const handleToggleMeta = async (row: MetaSource) => {
    const res = await fetch(`/api/marketing/meta-sources/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: row.status === "active" ? "paused" : "active" }),
    });
    if (res.ok) loadMetaSources();
    else message.error("Could not update Meta connection");
  };

  const handleDeleteMeta = async (id: string) => {
    const res = await fetch(`/api/marketing/meta-sources/${id}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Meta connection removed — existing leads are kept");
      loadMetaSources();
    } else {
      message.error("Could not remove Meta connection");
    }
  };

  const handleAddCampaign = async () => {
    try {
      const values = await campaignForm.validateFields();
      setCampaignSubmitting(true);
      const res = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name, status: values.status }),
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.error || "Could not create campaign");
        return;
      }
      message.success("Campaign created");
      campaignForm.resetFields();
      setCampaignModalOpen(false);
      loadCampaigns();
    } catch {
      // validation error, ignore
    } finally {
      setCampaignSubmitting(false);
    }
  };

  // Import disabled for now — see the commented Import button/modal below.
  // const handleUploadFile = (file: File) => {
  //   const name = file.name.toLowerCase();
  //   if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
  //     message.error("Please upload an Excel (.xlsx) file");
  //     return false;
  //   }
  //   const reader = new FileReader();
  //   reader.onload = (e) => {
  //     try {
  //       const buffer = e.target?.result as ArrayBuffer;
  //       if (!buffer) {
  //         message.error("Failed to read file");
  //         return;
  //       }
  //       const rows = parseLeadsExcelFile(buffer);
  //       if (rows.length === 0) {
  //         message.error("No valid rows found — need at least a Name, Phone, or Email column");
  //         return;
  //       }
  //       setParsedLeads(rows);
  //     } catch {
  //       message.error("Failed to parse Excel file");
  //     }
  //   };
  //   reader.readAsArrayBuffer(file);
  //   return false;
  // };

  // const handleImport = async () => {
  //   if (!importCampaignId || parsedLeads.length === 0) return;
  //   setImporting(true);
  //   try {
  //     const res = await fetch("/api/marketing/leads/import", {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ campaign_id: importCampaignId, leads: parsedLeads }),
  //     });
  //     const json = await res.json();
  //     if (!res.ok) {
  //       message.error(json.error || "Import failed");
  //       return;
  //     }
  //     message.success(
  //       `Imported ${json.created} lead(s)` + (json.skipped ? ` — ${json.skipped} row(s) skipped` : "")
  //     );
  //     setImportOpen(false);
  //     setParsedLeads([]);
  //     setImportCampaignId(undefined);
  //     loadCampaigns();
  //     if (statusFilter) loadFlatLeads(statusFilter);
  //   } catch {
  //     message.error("Import failed");
  //   } finally {
  //     setImporting(false);
  //   }
  // };

  return (
    <div>
      <Link
        href="/marketing/dashboard"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
          color: "#4f46e5",
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <ArrowLeftOutlined /> Back to Dashboard
      </Link>

      <Title level={3} style={{ marginBottom: 24 }}>
        Campaign
      </Title>

      <Card
        bordered={false}
        style={{ borderRadius: 16, marginBottom: 24 }}
        title="Advertise URLs"
        extra={
          <Space>
            <Tooltip title="Fetch latest data from all active Advertise URLs now">
              <Button icon={<ReloadOutlined />} onClick={handleSyncNow} loading={syncing}>
                Refresh
              </Button>
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Add Advertise URL
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loadingSources}
          dataSource={adSources}
          pagination={false}
          columns={[
            {
              title: "URL",
              dataIndex: "sheet_url",
              render: (url: string, row: AdSource) => (
                <a href={url} target="_blank" rel="noreferrer">
                  <LinkOutlined /> {row.label || url}
                </a>
              ),
            },
            {
              title: "Status",
              dataIndex: "status",
              width: 100,
              render: (status: string) => (
                <Tag color={status === "active" ? "green" : "default"}>{status}</Tag>
              ),
            },
            // {
            //   title: "Last Synced",
            //   // dataIndex: "last_synced_at",
            //   width: 200,
            //   render: (value: string | null, row: AdSource) =>
            //     value ? (
            //       <span>
            //         {new Date(value).toLocaleString()}{" "}
            //         <Tag color={row.last_sync_status === "success" ? "green" : "red"}>
            //           {row.last_sync_status}
            //         </Tag>
            //       </span>
            //     ) : (
            //       <Text type="secondary">Not synced yet</Text>
            //     ),
            // },
            {
              title: "Rows",
              dataIndex: "last_sync_rows",
              width: 80,
              render: (v: number | null) => v ?? "—",
            },
            {
              title: "",
              key: "actions",
              width: 60,
              render: (_: unknown, row: AdSource) => (
                <Popconfirm
                  title="Remove this Advertise URL?"
                  onConfirm={() => handleDeleteUrl(row.id)}
                >
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>

      <Card
        bordered={false}
        style={{ borderRadius: 16, marginBottom: 24 }}
        title={
          <span>
            <FacebookOutlined style={{ color: "#1877f2" }} /> Meta Lead Ads
          </span>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setMetaModalOpen(true)}>
            Connect Meta Token
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={loadingMeta}
          dataSource={metaSources}
          pagination={false}
          locale={{ emptyText: "No Meta token connected yet" }}
          expandable={{
            rowExpandable: (row: MetaSource) => (row.discovered_forms ?? []).length > 0,
            expandedRowRender: (row: MetaSource) => (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={row.discovered_forms}
                columns={[
                  {
                    title: "Lead Form",
                    key: "form",
                    render: (_: unknown, form: MetaFormResult) => (
                      <span>
                        {form.name || "Untitled"}
                        <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                          Form ID {form.id}
                        </Text>
                      </span>
                    ),
                  },
                  {
                    title: "Meta Status",
                    dataIndex: "status",
                    render: (v: string | null) => (v ? <Tag>{v}</Tag> : "—"),
                  },
                  { title: "Leads Read", dataIndex: "leads_read" },
                  { title: "Imported", dataIndex: "imported" },
                  { title: "Duplicates", dataIndex: "duplicates" },
                  {
                    title: "Error",
                    dataIndex: "error",
                    render: (v: string | null) => (v ? <Text type="danger">{v}</Text> : "—"),
                  },
                ]}
              />
            ),
          }}
          columns={[
            {
              title: "Page",
              key: "page",
              render: (_: unknown, row: MetaSource) => (
                <span>
                  {row.label || row.page_name || row.page_id || "Conversions API"}
                  <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                    {row.page_id ? `Page ${row.page_id}` : "Status updates only"} · token {row.token_hint}
                  </Text>
                </span>
              ),
            },
            {
              title: "Status",
              dataIndex: "status",
              width: 100,
              render: (status: string) => (
                <Tag color={status === "active" ? "green" : "default"}>{status}</Tag>
              ),
            },
            {
              title: "Last Sync",
              key: "lastSync",
              width: 230,
              render: (_: unknown, row: MetaSource) =>
                !row.page_id ? (
                  <Text type="secondary">No lead sync</Text>
                ) : row.last_sync_status ? (
                  <Tooltip title={row.last_sync_error || undefined}>
                    <Tag color={row.last_sync_status === "success" ? "green" : "red"}>
                      
                    </Tag>
                    {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString() : ""}
                  </Tooltip>
                ) : (
                  <Text type="secondary">Not synced yet</Text>
                ),
            },
            {
              title: "Last Sync Result",
              key: "syncStats",
              width: 190,
              render: (_: unknown, row: MetaSource) =>
                !row.page_id || row.last_sync_leads === null ? (
                  "—"
                ) : (
                  <span style={{ fontSize: 12 }}>
                    {row.last_sync_leads} imported · {row.last_sync_duplicates ?? 0} duplicates
                    <br />
                    {row.last_sync_forms ?? 0} forms ·{" "}
                    <Text type={row.last_sync_errors ? "danger" : "secondary"} style={{ fontSize: 12 }}>
                      {row.last_sync_errors ?? 0} errors
                    </Text>
                  </span>
                ),
            },
            {
              title: "Status → Meta",
              key: "capi",
              width: 130,
              render: (_: unknown, row: MetaSource) =>
                row.dataset_id ? (
                  <Tooltip title={`Dataset ${row.dataset_id}`}>
                    <Tag color="blue">On</Tag>
                  </Tooltip>
                ) : (
                  <Tag>Off</Tag>
                ),
            },
            {
              title: "",
              key: "actions",
              width: 200,
              render: (_: unknown, row: MetaSource) => (
                <Space>
                  <Button
                    size="small"
                    loading={checkingMetaId === row.id}
                    onClick={() => handleCheckMeta(row.id)}
                  >
                    Check
                  </Button>
                  <Button size="small" onClick={() => handleToggleMeta(row)}>
                    {row.status === "active" ? "Pause" : "Resume"}
                  </Button>
                  <Popconfirm
                    title="Disconnect this Meta token? Leads already imported are kept."
                    onConfirm={() => handleDeleteMeta(row.id)}
                  >
                    <Button danger type="text" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Text type="secondary" style={{ display: "block", marginBottom: 6, fontSize: 12 }}>
            Filter by status
          </Text>
          <Select<LeadStatus | "all">
            value={statusFilter ?? "all"}
            onChange={(v) => setStatusFilter(v === "all" ? undefined : v)}
            style={{ width: 240 }}
            options={[{ value: "all", label: "All campaigns" }, ...STATUS_OPTIONS]}
          />
        </div>
        <div>
          <Text type="secondary" style={{ display: "block", marginBottom: 6, fontSize: 12 }}>
            Filter by received date
          </Text>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(values) =>
              updateFilters({ range: values && values[0] && values[1] ? [values[0], values[1]] : null })
            }
            presets={DATE_PRESETS}
            format="DD MMM YYYY"
            allowClear
            disabledDate={(d) => d.isAfter(dayjs().endOf("day"))}
            style={{ width: 280 }}
          />
        </div>
        <Space style={{ marginLeft: "auto" }}>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => {
              const params = [statusFilter ? `status=${statusFilter}` : "", dateQuery].filter(Boolean).join("&");
              window.open(`/api/marketing/leads/export${params ? `?${params}` : ""}`, "_blank");
            }}
          >
            Export
          </Button>
          {/* Import disabled for now — needs the sm_agent INSERT RLS policy applied first.
          <Button icon={<UploadOutlined />} onClick={() => { setImportOpen(true); setParsedLeads([]); setImportCampaignId(undefined); }}>
            Import
          </Button>
          */}
        </Space>
      </div>

      {statusFilter ? (
        <Card bordered={false} style={{ borderRadius: 16 }} title={`Leads${dateRangeLabel}`}>
          <Table
            rowKey="id"
            loading={flatLoading}
            dataSource={flatLeads}
            onRow={(row) => ({
              onClick: () => router.push(`/marketing/campaigns/${row.simplified_campaign_id}`),
              style: { cursor: "pointer" },
            })}
            columns={[
              {
                title: "Sr.No",
                key: "srNo",
                width: 70,
                render: (_: unknown, __: FlatLead, index: number) => index + 1,
              },
              { title: "Name", dataIndex: "name", render: (v: string | null) => v || "—" },
              { title: "Phone", dataIndex: "phone", render: (v: string | null) => formatPhone(v) || "—" },
              {
                title: "Property",
                key: "property",
                render: (_: unknown, row: FlatLead) => getPropertyValue(row.raw_data) || "—",
              },
              {
                title: "Campaign",
                key: "campaign",
                render: (_: unknown, row: FlatLead) => row.simplified_campaigns?.name || "—",
              },
              {
                title: "Source",
                key: "source",
                render: (_: unknown, row: FlatLead) => {
                  const info = getLeadSourceInfo(row);
                  return <Tag color={info.source === "meta" ? "blue" : "default"}>{info.sourceLabel}</Tag>;
                },
              },
              {
                title: "Status",
                dataIndex: "status",
                render: (status: LeadStatus) => (
                  <Tag color={statusColors[status]}>{status.replace("_", " ").toUpperCase()}</Tag>
                ),
              },
            ]}
          />
        </Card>
      ) : (
        <Card
          bordered={false}
          style={{ borderRadius: 16 }}
          title={`All Campaigns${dateRangeLabel}`}
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCampaignModalOpen(true)}>
              Add Campaign
            </Button>
          }
        >
          <Table
            rowKey="id"
            loading={loadingCampaigns}
            dataSource={campaigns}
            locale={dateRange ? { emptyText: "No leads received in this date range" } : undefined}
            columns={[
              {
                title: "Ad Name",
                dataIndex: "displayName",
                render: (displayName: string, row: CampaignRow) => (
                  <Link href={`/marketing/campaigns/${row.id}`}>{displayName}</Link>
                ),
              },
              {
                title: "New",
                dataIndex: ["leadCounts", "new"],
                render: (_: unknown, row: CampaignRow) => row.leadCounts.new,
              },
              {
                title: "Follow Up",
                dataIndex: ["leadCounts", "follow_up"],
                render: (_: unknown, row: CampaignRow) => row.leadCounts.follow_up,
              },
              {
                title: "In Progress",
                dataIndex: ["leadCounts", "in_progress"],
                render: (_: unknown, row: CampaignRow) => row.leadCounts.in_progress,
              },
              {
                title: "Closed",
                dataIndex: ["leadCounts", "closed"],
                render: (_: unknown, row: CampaignRow) => row.leadCounts.closed,
              },
              {
                title: "Total Leads",
                dataIndex: ["leadCounts", "total"],
                render: (_: unknown, row: CampaignRow) => row.leadCounts.total,
              },
            ]}
          />
        </Card>
      )}

      <Modal
        title="Add Advertise URL"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleAddUrl}
        confirmLoading={submitting}
        okText="Add"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Google Sheet URL"
            name="sheet_url"
            rules={[
              { required: true, message: "Sheet URL is required" },
              {
                pattern: /^https:\/\/docs\.google\.com\/spreadsheets\/d\//,
                message: "Must be a Google Sheets URL",
              },
            ]}
          >
            <Input placeholder="https://docs.google.com/spreadsheets/d/..." />
          </Form.Item>
          <Form.Item label="Label (optional)" name="label">
            <Input placeholder="e.g. Meta Ads — Nov Campaign" />
          </Form.Item>
        </Form>
        <Text type="secondary">
          Sheet must be shared as &quot;Anyone with the link can view&quot;. It will sync
          automatically every 30 minutes.
        </Text>
      </Modal>

      <Modal
        title="Connect Meta Lead Ads"
        open={metaModalOpen}
        onCancel={() => setMetaModalOpen(false)}
        onOk={handleConnectMeta}
        confirmLoading={metaConnecting}
        okText="Connect & Sync"
        destroyOnClose
      >
        <Form form={metaForm} layout="vertical" preserve={false}>
          <Form.Item
            label="Access Token"
            name="access_token"
            rules={[{ required: true, message: "Access token is required" }]}
            extra="Page or System User token with leads_retrieval and pages_manage_ads permissions."
          >
            <Input.Password placeholder="EAAB..." autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="Page ID (optional)"
            name="page_id"
            rules={[{ pattern: /^\d+$/, message: "Page ID is numeric" }]}
            extra="Needed only when the token manages more than one Page."
          >
            <Input placeholder="e.g. 102938475610293" />
          </Form.Item>
          <Form.Item
            label="Dataset ID (optional)"
            name="dataset_id"
            rules={[{ pattern: /^\d+$/, message: "Dataset ID is numeric" }]}
            extra="Set this to send lead status updates back to Meta (Conversions API CRM events)."
          >
            <Input placeholder="Pixel / dataset id from Events Manager" />
          </Form.Item>
          <Form.Item label="Label (optional)" name="label">
            <Input placeholder="e.g. Main Facebook Page" />
          </Form.Item>
        </Form>
        <Text type="secondary">
          The token is checked with Meta first. If it can read lead data, leads from every lead
          form on the Page are imported now and then every 30 minutes, visible to Marketing and
          Agents. A token that can&apos;t read leads (e.g. a Conversions API token from Events
          Manager) is saved for status updates only — add a Dataset ID for that. The token is stored
          server-side and never shown again.
        </Text>
      </Modal>

      <Modal
        title="Meta Token Check"
        open={!!tokenCheck}
        onCancel={() => setTokenCheck(null)}
        footer={<Button onClick={() => setTokenCheck(null)}>Close</Button>}
        width={640}
      >
        {tokenCheck && <MetaTokenCheckResult check={tokenCheck} />}
      </Modal>

      <Modal
        title="Add Campaign"
        open={campaignModalOpen}
        onCancel={() => setCampaignModalOpen(false)}
        onOk={handleAddCampaign}
        confirmLoading={campaignSubmitting}
        okText="Create"
      >
        <Form form={campaignForm} layout="vertical" initialValues={{ status: "active" }}>
          <Form.Item
            label="Campaign Name"
            name="name"
            rules={[{ required: true, message: "Campaign name is required" }]}
          >
            <Input placeholder="e.g. Winter Outreach" />
          </Form.Item>
          <Form.Item label="Status" name="status">
            <Select
              options={[
                { value: "active", label: "Active" },
                { value: "draft", label: "Draft" },
              ]}
            />
          </Form.Item>
        </Form>
        <Text type="secondary">
          Leads for this campaign are added manually from its detail page — it will not
          pick up leads from Advertise URL syncing, which only creates its own campaigns.
        </Text>
      </Modal>

      {/* Import modal disabled for now — needs the sm_agent INSERT RLS policy applied first.
      <Modal
        title="Import Leads"
        open={importOpen}
        onCancel={() => { setImportOpen(false); setParsedLeads([]); setImportCampaignId(undefined); }}
        onOk={handleImport}
        confirmLoading={importing}
        okText={parsedLeads.length > 0 ? `Import ${parsedLeads.length} Lead(s)` : "Import"}
        okButtonProps={{ disabled: !importCampaignId || parsedLeads.length === 0 }}
      >
        <Form layout="vertical">
          <Form.Item label="Campaign" required>
            <Select
              placeholder="Select the campaign to import leads into"
              value={importCampaignId}
              onChange={(v) => setImportCampaignId(v)}
              options={campaigns.map((c) => ({ value: c.id, label: c.displayName }))}
            />
          </Form.Item>
        </Form>
        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          Upload an Excel (.xlsx) file with columns for Name, Phone, Email, Property, and Notes.
          New leads are added with status "New".
        </Text>
        <Upload.Dragger
          accept=".xlsx,.xls"
          maxCount={1}
          beforeUpload={(file) => handleUploadFile(file)}
          onRemove={() => setParsedLeads([])}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag an Excel file here</p>
        </Upload.Dragger>
        {parsedLeads.length > 0 && (
          <Text type="success" style={{ display: "block", marginTop: 12 }}>
            {parsedLeads.length} row(s) ready to import.
          </Text>
        )}
      </Modal>
      */}
    </div>
  );
}
