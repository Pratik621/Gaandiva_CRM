"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Typography, Card, Table, Alert, Button, Tooltip, message, Select, Tag, Space } from "antd";
import { ReloadOutlined, DownloadOutlined } from "@ant-design/icons";
import { getPropertyValue, formatPhone, getLeadSourceInfo } from "@/lib/marketing/lead-fields";
// import { parseLeadsExcelFile, type ParsedLeadRow } from "@/lib/marketing/leads-import-parse"; // TODO: re-enable with Import

const { Title, Text } = Typography;

type LeadStatus = "new" | "follow_up" | "in_progress" | "closed";

interface CampaignRow {
  id: string;
  displayName: string;
  status: string;
  leadCounts: { new: number; follow_up: number; in_progress: number; closed: number; total: number };
}

interface FlatLead {
  id: string;
  name: string | null;
  phone: string | null;
  status: LeadStatus;
  raw_data: Record<string, string>;
  simplified_campaign_id: string;
  simplified_campaigns: { name: string } | null;
  updated_by_name: string | null;
  source: string | null;
  meta_form_name: string | null;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New / Not Contacted" },
  { value: "follow_up", label: "Follow-up Due" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

const statusColors: Record<LeadStatus, string> = {
  new: "gold",
  follow_up: "orange",
  in_progress: "blue",
  closed: "green",
};

export default function SmAgentCampaignsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") as LeadStatus | null;

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [flatLeads, setFlatLeads] = useState<FlatLead[]>([]);
  const [flatLoading, setFlatLoading] = useState(false);

  // Import disabled for now — see the commented Import button/modal below.
  // const [importOpen, setImportOpen] = useState(false);
  // const [importing, setImporting] = useState(false);
  // const [importCampaignId, setImportCampaignId] = useState<string | undefined>(undefined);
  // const [parsedLeads, setParsedLeads] = useState<ParsedLeadRow[]>([]);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/campaigns");
      const json = await res.json();
      if (res.ok) {
        setCampaigns(json.campaigns ?? []);
        setLoadError(null);
      } else {
        setLoadError(json.error || `Request failed (HTTP ${res.status})`);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFlatLeads = useCallback(async (status: LeadStatus) => {
    setFlatLoading(true);
    try {
      const res = await fetch(`/api/sm-agent/leads?status=${status}`);
      const json = await res.json();
      if (res.ok) {
        setFlatLeads(json.leads ?? []);
        setLoadError(null);
      } else {
        setLoadError(json.error || `Request failed (HTTP ${res.status})`);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    } finally {
      setFlatLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (statusFilter) loadFlatLeads(statusFilter);
  }, [statusFilter, loadFlatLeads]);

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
      if (failed.length > 0) {
        message.warning(`Synced with ${failed.length} error(s) — check with your marketing team`);
      } else {
        message.success(totalLeads > 0 ? `Synced — ${totalLeads} new lead(s) added` : "Synced — no new leads");
      }
      await loadCampaigns();
      if (statusFilter) await loadFlatLeads(statusFilter);
    } catch {
      message.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const setStatusFilter = (status: LeadStatus | undefined) => {
    const qs = status ? `?status=${status}` : "";
    router.push(`/sm-agent/leads${qs}`);
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          My Leads
        </Title>
        <Tooltip title="Fetch latest leads from all active campaigns now">
          <Button icon={<ReloadOutlined />} onClick={handleSyncNow} loading={syncing}>
            Refresh
          </Button>
        </Tooltip>
      </div>

      {loadError && (
        <Alert
          type="error"
          showIcon
          message="Couldn't load leads"
          description={loadError}
          style={{ marginBottom: 20 }}
        />
      )}

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
        <Space>
          <Button
            icon={<DownloadOutlined />}
            onClick={() =>
              window.open(
                `/api/marketing/leads/export${statusFilter ? `?status=${statusFilter}` : ""}`,
                "_blank"
              )
            }
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
        <Card bordered={false} style={{ borderRadius: 16 }}>
          <Table
            rowKey="id"
            loading={flatLoading}
            dataSource={flatLeads}
            onRow={(row) => ({
              onClick: () => router.push(`/sm-agent/leads/${row.simplified_campaign_id}?status=${statusFilter}`),
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
              {
                title: "Last Updated By",
                dataIndex: "updated_by_name",
                render: (v: string | null) => v || "—",
              },
            ]}
          />
        </Card>
      ) : (
        <Card bordered={false} style={{ borderRadius: 16 }}>
          <Table
            rowKey="id"
            loading={loading}
            dataSource={campaigns}
            columns={[
              {
                title: "Ad Name",
                dataIndex: "displayName",
                render: (displayName: string, row: CampaignRow) => (
                  <Link href={`/sm-agent/leads/${row.id}`}>{displayName}</Link>
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
