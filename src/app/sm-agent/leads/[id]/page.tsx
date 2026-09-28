"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Drawer,
  Input,
  Select,
  DatePicker,
  message,
  Timeline,
  Empty,
  Alert,
  Row,
  Col,
  Collapse,
  Space,
  // Modal, Upload, // TODO: re-enable once the sm_agent INSERT RLS policy is applied
} from "antd";
import { ArrowLeftOutlined, ClockCircleOutlined, DownloadOutlined /* , UploadOutlined, InboxOutlined */ } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  getPropertyValue,
  getLocation,
  getAdName,
  mostCommon,
  formatPhone,
  getLeadSourceInfo,
} from "@/lib/marketing/lead-fields";
// import { parseLeadsExcelFile, type ParsedLeadRow } from "@/lib/marketing/leads-import-parse"; // TODO: re-enable with Import
import AdditionalLeadDetails from "@/components/Marketing/AdditionalLeadDetails";

const { Title, Text } = Typography;

type LeadStatus = "new" | "follow_up" | "in_progress" | "closed";

interface Lead {
  id: string;
  simplified_campaign_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  next_action: string | null;
  callback_at: string | null;
  callback_timezone: string | null;
  last_contacted_at: string | null;
  call_count: number;
  call_form_response: { notes?: string } | null;
  raw_data: Record<string, string>;
  updated_by_name: string | null;
  updated_at: string | null;
  created_at: string;
  source: string | null;
  meta_form_id: string | null;
  meta_form_name: string | null;
  meta_campaign_name: string | null;
  meta_adset_name: string | null;
  meta_ad_name: string | null;
  meta_created_time: string | null;
  simplified_campaigns: { name: string; external_campaign_id: string | null } | null;
}

interface CampaignInfo {
  id: string;
  name: string;
}

interface CallRecord {
  id: string;
  called_at: string;
  outcome_label_snapshot: string;
  previous_status: string;
  resulting_status: string;
  notes: string | null;
}

const STATUS_TABS: { value: LeadStatus; label: string }[] = [
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

function isOverdue(lead: Lead): boolean {
  return lead.status === "follow_up" && !!lead.callback_at && dayjs(lead.callback_at).isBefore(dayjs());
}

/** Same boxed-section pattern as the main Leads drawer (LeadForm.tsx): a
 * single-panel Collapse styled as a bordered box with an icon + bold title
 * header and a chevron at the end. */
function renderSection(key: string, title: string, icon: string, children: React.ReactNode) {
  return (
    <Collapse key={key} defaultActiveKey={[key]} expandIconPosition="end">
      <Collapse.Panel
        key={key}
        header={
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {icon} {title}
          </span>
        }
      >
        {children}
      </Collapse.Panel>
    </Collapse>
  );
}

const VALID_STATUSES: LeadStatus[] = ["new", "follow_up", "in_progress", "closed"];

export default function SmAgentCampaignLeadsPage() {
  const params = useParams();
  const campaignId = params?.id as string | undefined;
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const initialStatusFilter = VALID_STATUSES.includes(statusParam as LeadStatus)
    ? (statusParam as LeadStatus)
    : "new";

  const [activeStatus, setActiveStatus] = useState<LeadStatus>(initialStatusFilter);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusValue, setStatusValue] = useState<LeadStatus | undefined>(undefined);
  const [initialStatus, setInitialStatus] = useState<LeadStatus | undefined>(undefined);
  const [notesValue, setNotesValue] = useState("");
  const [initialNotes, setInitialNotes] = useState("");
  const [callbackAt, setCallbackAt] = useState<dayjs.Dayjs | null>(null);
  const [initialCallbackAt, setInitialCallbackAt] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Import disabled for now — see the commented Import button/modal below.
  // const [importOpen, setImportOpen] = useState(false);
  // const [importing, setImporting] = useState(false);
  // const [parsedLeads, setParsedLeads] = useState<ParsedLeadRow[]>([]);

  const loadLeads = useCallback(
    async (status: LeadStatus) => {
      if (!campaignId) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/sm-agent/leads?campaign_id=${campaignId}&status=${status}`);
        const json = await res.json();
        if (res.ok) {
          setLeads(json.leads ?? []);
          setLoadError(null);
        } else {
          setLoadError(json.error || `Request failed (HTTP ${res.status})`);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    },
    [campaignId]
  );

  const loadCampaign = useCallback(async () => {
    if (!campaignId) return;
    const res = await fetch(`/api/marketing/campaigns/${campaignId}`);
    const json = await res.json();
    if (res.ok) setCampaign(json.campaign ?? null);
  }, [campaignId]);

  useEffect(() => {
    loadLeads(activeStatus);
    setPage(1);
  }, [activeStatus, loadLeads]);

  useEffect(() => {
    loadCampaign();
  }, [loadCampaign]);

  // Prefer the ad name from the sheet's ad_name column — a campaign can span
  // multiple ads, so show whichever is most common among its loaded leads.
  const headerName = useMemo(() => {
    return mostCommon(leads.map((lead) => getAdName(lead.raw_data))) || campaign?.name || "Campaign Leads";
  }, [leads, campaign]);

  const applyLeadToForm = (lead: Lead) => {
    setActiveLead(lead);
    setStatusValue(lead.status);
    setInitialStatus(lead.status);
    const notes = lead.call_form_response?.notes ?? "";
    setNotesValue(notes);
    setInitialNotes(notes);
    setCallbackAt(lead.callback_at ? dayjs(lead.callback_at) : null);
    setInitialCallbackAt(lead.callback_at);
  };

  const openLead = async (lead: Lead) => {
    applyLeadToForm(lead);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/sm-agent/leads/${lead.id}`);
      const json = await res.json();
      if (res.ok) {
        applyLeadToForm(json.lead);
        setCallHistory(json.calls ?? []);
      } else {
        message.error(json.error || "Could not load lead details");
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setDetailLoading(false);
    }
  };

  const callbackAtIso = callbackAt ? callbackAt.toISOString() : null;
  const hasUnsavedChanges =
    statusValue !== initialStatus ||
    notesValue !== initialNotes ||
    (statusValue === "follow_up" && callbackAtIso !== initialCallbackAt);

  const handleUpdateStatus = async () => {
    if (!activeLead || !statusValue) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/sm-agent/leads/${activeLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusValue, notes: notesValue, callback_at: callbackAtIso }),
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.error || "Could not update lead");
        return;
      }
      message.success("Lead updated");
      applyLeadToForm(json.lead);
      loadLeads(activeStatus);
    } finally {
      setUpdatingStatus(false);
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
  //   if (!campaignId || parsedLeads.length === 0) return;
  //   setImporting(true);
  //   try {
  //     const res = await fetch(`/api/marketing/campaigns/${campaignId}/leads/import`, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ leads: parsedLeads }),
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
  //     loadLeads(activeStatus);
  //   } catch {
  //     message.error("Import failed");
  //   } finally {
  //     setImporting(false);
  //   }
  // };

  return (
    <div>
      <Link
        href="/sm-agent/leads"
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
        <ArrowLeftOutlined /> Back to Leads
      </Link>

      <Title level={3} style={{ marginBottom: 4 }}>
        {headerName}
        <Tag color="blue" style={{ marginLeft: 12, fontSize: 13, verticalAlign: "middle" }}>
          {leads.length} {leads.length === 1 ? "lead" : "leads"}
        </Tag>
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
        Campaign Leads
      </Text>

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
          <Select<LeadStatus>
            value={activeStatus}
            onChange={(v) => setActiveStatus(v)}
            style={{ width: 240 }}
            options={STATUS_TABS.map((t) => ({ label: t.label, value: t.value }))}
          />
        </div>
        <Space>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => window.open(`/api/marketing/campaigns/${campaignId}/leads/export`, "_blank")}
          >
            Export
          </Button>
          {/* Import disabled for now — needs the sm_agent INSERT RLS policy applied first.
          <Button icon={<UploadOutlined />} onClick={() => { setImportOpen(true); setParsedLeads([]); }}>
            Import
          </Button>
          */}
        </Space>
      </div>

      <Card bordered={false} style={{ borderRadius: 16 }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={leads}
          onRow={(row) => ({ onClick: () => openLead(row), style: { cursor: "pointer" } })}
          columns={[
            {
              title: "Sr.No",
              key: "srNo",
              width: 70,
              render: (_: unknown, __: Lead, index: number) => (page - 1) * pageSize + index + 1,
            },
            { title: "Name", dataIndex: "name", render: (v: string | null) => v || "—" },
            { title: "Phone", dataIndex: "phone", render: (v: string | null) => formatPhone(v) || "—" },
            {
              title: "Property",
              key: "property",
              render: (_: unknown, row: Lead) => getPropertyValue(row.raw_data) || "—",
            },
            {
              title: "Source",
              key: "source",
              render: (_: unknown, row: Lead) => {
                const info = getLeadSourceInfo(row);
                return (
                  <span>
                    <Tag color={info.source === "meta" ? "blue" : "default"}>{info.sourceLabel}</Tag>
                    {info.formName && (
                      <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                        {info.formName}
                      </Text>
                    )}
                  </span>
                );
              },
            },
            {
              title: "Received",
              dataIndex: "created_at",
              render: (v: string) => (v ? dayjs(v).format("DD MMM YYYY, HH:mm") : "—"),
            },
            ...(activeStatus === "follow_up"
              ? [
                  {
                    title: "Callback Due",
                    key: "callback_at",
                    render: (_: unknown, row: Lead) =>
                      row.callback_at ? (
                        <span style={{ color: isOverdue(row) ? "#ef4444" : undefined, fontWeight: isOverdue(row) ? 600 : 400 }}>
                          <ClockCircleOutlined /> {dayjs(row.callback_at).format("DD MMM, HH:mm")}
                          {isOverdue(row) && (
                            <Tag color="red" style={{ marginLeft: 8 }}>
                              Overdue
                            </Tag>
                          )}
                        </span>
                      ) : (
                        "—"
                      ),
                  },
                ]
              : []),
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
          pagination={{
            current: page,
            pageSize,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>

      <Drawer
        title={activeLead?.name || "Lead"}
        placement="right"
        open={!!activeLead}
        onClose={() => setActiveLead(null)}
        width={1080}
        destroyOnClose
        maskClosable
        styles={{ body: { paddingBottom: 80 } }}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button onClick={() => setActiveLead(null)}>Close</Button>
          </div>
        }
      >
        {activeLead && (
          <>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 20, fontSize: 13 }}>
              Review the lead&apos;s details and call history below, then update the status and
              notes.
            </Typography.Paragraph>

            <Row gutter={24} align="top" style={{ marginBottom: 16 }}>
              <Col xs={24} md={12}>
                {renderSection(
                  "lead-info",
                  "Lead Information",
                  "👤",
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                          Phone
                        </Text>
                        <Text>{formatPhone(activeLead.phone) || "—"}</Text>
                      </div>
                    </Col>
                    <Col xs={24} sm={12}>
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                          Email
                        </Text>
                        <Text>{activeLead.email || "—"}</Text>
                      </div>
                    </Col>
                    <Col xs={24} sm={12}>
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                          Location
                        </Text>
                        <Text>{getLocation(activeLead.raw_data) || "—"}</Text>
                      </div>
                    </Col>
                    <Col xs={24} sm={12}>
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                          Property
                        </Text>
                        <Text>{getPropertyValue(activeLead.raw_data) || "—"}</Text>
                      </div>
                    </Col>
                    {(() => {
                      const info = getLeadSourceInfo(activeLead);
                      // Meta leads show only Meta's own campaign name; other
                      // sources use their CRM campaign.
                      const campaignName =
                        info.campaignName ||
                        (info.source !== "meta" ? activeLead.simplified_campaigns?.name : null);
                      const items: [string, React.ReactNode][] = [
                        ["Source", <Tag key="s" color={info.source === "meta" ? "blue" : "default"}>{info.sourceLabel}</Tag>],
                        ["Received", dayjs(info.metaCreatedTime || activeLead.created_at).format("DD MMM YYYY, HH:mm")],
                        ["Campaign", campaignName || "—"],
                      ];
                      if (info.formName) items.push(["Lead Form", info.formName]);
                      if (info.adsetName) items.push(["Ad Set", info.adsetName]);
                      if (info.adName) items.push(["Ad", info.adName]);
                      return items.map(([label, value]) => (
                        <Col xs={24} sm={12} key={label}>
                          <div style={{ marginBottom: 12 }}>
                            <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                              {label}
                            </Text>
                            <Text>{value}</Text>
                          </div>
                        </Col>
                      ));
                    })()}
                  </Row>
                )}
              </Col>

              <Col xs={24} md={12}>
                {renderSection(
                  "status",
                  "Current Status",
                  "📊",
                  <Row gutter={16}>
                    <Col xs={24}>
                      <div style={{ marginBottom: 16 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                          Status
                        </Text>
                        <Select<LeadStatus>
                          value={statusValue}
                          onChange={(v) => setStatusValue(v)}
                          style={{ width: "100%" }}
                          options={STATUS_TABS.map((t) => ({ value: t.value, label: t.label }))}
                        />
                      </div>
                    </Col>
                    {statusValue === "follow_up" && (
                      <Col xs={24}>
                        <div style={{ marginBottom: 16 }}>
                          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                            Callback Date/Time
                          </Text>
                          <DatePicker
                            showTime
                            style={{ width: "100%" }}
                            value={callbackAt}
                            onChange={(v) => setCallbackAt(v)}
                          />
                        </div>
                      </Col>
                    )}
                    <Col xs={24}>
                      <div style={{ marginBottom: 16 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                          Comment / Notes
                        </Text>
                        <Input.TextArea
                          rows={3}
                          value={notesValue}
                          onChange={(e) => setNotesValue(e.target.value)}
                          placeholder="What happened on this call, context for next time..."
                        />
                      </div>
                    </Col>
                    <Col xs={24}>
                      <Button
                        type="primary"
                        onClick={handleUpdateStatus}
                        loading={updatingStatus}
                        disabled={!hasUnsavedChanges}
                        block
                      >
                        Update
                      </Button>
                    </Col>
                    <Col xs={24} sm={12} style={{ marginTop: 16 }}>
                      <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                        Calls so far
                      </Text>
                      <Text>{activeLead.call_count}</Text>
                    </Col>
                    <Col xs={24} sm={12} style={{ marginTop: 16 }}>
                      <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                        Callback Due
                      </Text>
                      <Text>
                        {activeLead.callback_at
                          ? dayjs(activeLead.callback_at).format("DD MMM YYYY, HH:mm")
                          : "—"}
                      </Text>
                    </Col>
                    <Col xs={24} style={{ marginTop: 16 }}>
                      <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                        Last Updated By
                      </Text>
                      <Text>
                        {activeLead.updated_by_name || "—"}
                        {activeLead.updated_by_name && activeLead.updated_at && (
                          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            {dayjs(activeLead.updated_at).format("DD MMM YYYY, HH:mm")}
                          </Text>
                        )}
                      </Text>
                    </Col>
                  </Row>
                )}
              </Col>
            </Row>

            <Row gutter={24} align="top" style={{ marginBottom: 16 }}>
              {Object.entries(activeLead.raw_data || {}).some(([, v]) => v) && (
                <Col xs={24} md={12}>
                  {renderSection(
                    "additional",
                    "Additional Details",
                    "📋",
                    <AdditionalLeadDetails rawData={activeLead.raw_data} />
                  )}
                </Col>
              )}

              <Col xs={24} md={12}>
                {renderSection(
                  "history",
                  "Call History",
                  "🕑",
                  callHistory.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No calls yet" style={{ margin: "8px 0" }} />
                  ) : (
                    <Timeline
                      items={callHistory.map((call) => ({
                        children: (
                          <div key={call.id}>
                            <Text strong>{call.outcome_label_snapshot}</Text>
                            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                              {dayjs(call.called_at).format("DD MMM YYYY, HH:mm")}
                            </Text>
                            <div style={{ fontSize: 12, color: "#898781" }}>
                              {call.previous_status.replace("_", " ")} → {call.resulting_status.replace("_", " ")}
                            </div>
                            {call.notes && (
                              <div
                                style={{
                                  marginTop: 6,
                                  padding: "8px 10px",
                                  background: "#f9f9f7",
                                  border: "1px solid #f0f0f0",
                                  borderRadius: 8,
                                  fontSize: 13,
                                }}
                              >
                                {call.notes}
                              </div>
                            )}
                          </div>
                        ),
                      }))}
                    />
                  )
                )}
              </Col>
            </Row>
          </>
        )}
      </Drawer>

      {/* Import modal disabled for now — needs the sm_agent INSERT RLS policy applied first.
      <Modal
        title="Import Leads"
        open={importOpen}
        onCancel={() => { setImportOpen(false); setParsedLeads([]); }}
        onOk={handleImport}
        confirmLoading={importing}
        okText={parsedLeads.length > 0 ? `Import ${parsedLeads.length} Lead(s)` : "Import"}
        okButtonProps={{ disabled: parsedLeads.length === 0 }}
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          Upload an Excel (.xlsx) file with columns for Name, Phone, Email, Property, and Notes.
          New leads are added to this campaign with status "New".
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
