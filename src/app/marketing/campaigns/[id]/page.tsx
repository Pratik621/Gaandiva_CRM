"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Drawer,
  Modal,
  Form,
  Input,
  message,
  Descriptions,
  Space,
  // Upload, // TODO: re-enable once the sm_agent INSERT RLS policy is applied
} from "antd";
import { ArrowLeftOutlined, PlusOutlined, DownloadOutlined /* , UploadOutlined, InboxOutlined */ } from "@ant-design/icons";
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

interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  status: "new" | "follow_up" | "in_progress" | "closed";
  callback_at: string | null;
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
}

interface CampaignInfo {
  id: string;
  name: string;
  external_campaign_id: string | null;
}

const statusColors: Record<string, string> = {
  new: "gold",
  follow_up: "orange",
  in_progress: "blue",
  closed: "green",
};

export default function MarketingCampaignDetailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [addingLead, setAddingLead] = useState(false);
  const [addLeadForm] = Form.useForm();
  // Import disabled for now — see the commented Import button/modal below.
  // const [importOpen, setImportOpen] = useState(false);
  // const [importing, setImporting] = useState(false);
  // const [parsedLeads, setParsedLeads] = useState<ParsedLeadRow[]>([]);

  const loadLeads = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${id}/leads`);
      const json = await res.json();
      if (res.ok) setLeads(json.leads ?? []);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadCampaign = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/marketing/campaigns/${id}`);
    const json = await res.json();
    if (res.ok) setCampaign(json.campaign ?? null);
  }, [id]);

  useEffect(() => {
    loadLeads();
    loadCampaign();
  }, [loadLeads, loadCampaign]);

  // Prefer the ad name from the sheet's ad_name column (what leads actually
  // came from) — a campaign can span multiple ads, so show whichever ad name
  // is most common among its leads. Only falls back to the campaign's own
  // name when no lead carries an ad_name at all.
  const headerName = useMemo(() => {
    return mostCommon(leads.map((lead) => getAdName(lead.raw_data))) || campaign?.name || "Campaign Leads";
  }, [leads, campaign]);

  const openLead = (lead: Lead) => {
    setActiveLead(lead);
  };

  const handleAddLead = async () => {
    if (!id) return;
    try {
      const values = await addLeadForm.validateFields();
      setAddingLead(true);
      const res = await fetch(`/api/marketing/campaigns/${id}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          phone: values.phone,
          email: values.email,
          property: values.property,
          notes: values.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.error || "Could not add lead");
        return;
      }
      message.success("Lead added");
      addLeadForm.resetFields();
      setAddLeadOpen(false);
      loadLeads();
    } catch {
      // validation error
    } finally {
      setAddingLead(false);
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
  //   if (!id || parsedLeads.length === 0) return;
  //   setImporting(true);
  //   try {
  //     const res = await fetch(`/api/marketing/campaigns/${id}/leads/import`, {
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
  //     loadLeads();
  //   } catch {
  //     message.error("Import failed");
  //   } finally {
  //     setImporting(false);
  //   }
  // };

  return (
    <div>
      <Link
        href="/marketing/campaigns"
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
        <ArrowLeftOutlined /> Back to Campaigns
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

      <Card
        bordered={false}
        style={{ borderRadius: 16 }}
        extra={
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => window.open(`/api/marketing/campaigns/${id}/leads/export`, "_blank")}
            >
              Export
            </Button>
            {/* Import disabled for now — needs the sm_agent INSERT RLS policy applied first.
            <Button icon={<UploadOutlined />} onClick={() => { setImportOpen(true); setParsedLeads([]); }}>
              Import
            </Button>
            */}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddLeadOpen(true)}>
              Add Lead
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={leads}
          columns={[
            {
              title: "Sr.No",
              key: "srNo",
              width: 70,
              render: (_: unknown, __: Lead, index: number) => (page - 1) * pageSize + index + 1,
            },
            { title: "Name", dataIndex: "name", render: (v: string | null) => v || "—" },
            { title: "Phone", dataIndex: "phone", render: (v: string | null) => formatPhone(v) || "—" },
            { title: "Email", dataIndex: "email", render: (v: string | null) => v || "—" },
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
                return <Tag color={info.source === "meta" ? "blue" : "default"}>{info.sourceLabel}</Tag>;
              },
            },
            {
              title: "Status",
              dataIndex: "status",
              render: (status: string) => (
                <Tag color={statusColors[status]}>{status.toUpperCase()}</Tag>
              ),
            },
            {
              title: "Last Updated By",
              dataIndex: "updated_by_name",
              render: (v: string | null) => v || "—",
            },
          ]}
          onRow={(row) => ({
            onClick: () => openLead(row),
            style: { cursor: "pointer" },
          })}
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
        width={560}
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
              Lead details. Status is worked and updated by the assigned agent.
            </Typography.Paragraph>

            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Phone">{formatPhone(activeLead.phone) || "—"}</Descriptions.Item>
              <Descriptions.Item label="Email">{activeLead.email || "—"}</Descriptions.Item>
              <Descriptions.Item label="Location">{getLocation(activeLead.raw_data) || "—"}</Descriptions.Item>
              <Descriptions.Item label="Property">
                {getPropertyValue(activeLead.raw_data) || "—"}
              </Descriptions.Item>
              {(() => {
                const info = getLeadSourceInfo(activeLead);
                return (
                  <>
                    <Descriptions.Item label="Source">
                      <Tag color={info.source === "meta" ? "blue" : "default"}>{info.sourceLabel}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Received">
                      {dayjs(info.metaCreatedTime || activeLead.created_at).format("DD MMM YYYY, HH:mm")}
                    </Descriptions.Item>
                    {info.formName && (
                      <Descriptions.Item label="Lead Form">
                        {info.formName}
                        {info.formId ? ` (${info.formId})` : ""}
                      </Descriptions.Item>
                    )}
                    {info.campaignName && (
                      <Descriptions.Item label="Meta Campaign">{info.campaignName}</Descriptions.Item>
                    )}
                    {info.adsetName && <Descriptions.Item label="Ad Set">{info.adsetName}</Descriptions.Item>}
                    {info.adName && <Descriptions.Item label="Ad">{info.adName}</Descriptions.Item>}
                  </>
                );
              })()}
              <Descriptions.Item label="Status">
                <Tag color={statusColors[activeLead.status]}>{activeLead.status.toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Last Updated By">
                {activeLead.updated_by_name || "—"}
                {activeLead.updated_by_name && activeLead.updated_at
                  ? ` · ${dayjs(activeLead.updated_at).format("DD MMM YYYY, HH:mm")}`
                  : ""}
              </Descriptions.Item>
            </Descriptions>

            <AdditionalLeadDetails rawData={activeLead.raw_data} />
          </>
        )}
      </Drawer>

      <Modal
        title="Add Lead"
        open={addLeadOpen}
        onCancel={() => setAddLeadOpen(false)}
        onOk={handleAddLead}
        confirmLoading={addingLead}
        okText="Add"
      >
        <Form form={addLeadForm} layout="vertical">
          <Form.Item label="Name" name="name">
            <Input placeholder="Lead's name" />
          </Form.Item>
          <Form.Item label="Phone" name="phone">
            <Input placeholder="+91..." />
          </Form.Item>
          <Form.Item label="Email" name="email">
            <Input placeholder="lead@example.com" />
          </Form.Item>
          <Form.Item label="Property" name="property">
            <Input placeholder="e.g. 25-50" />
          </Form.Item>
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} placeholder="Any context for this lead..." />
          </Form.Item>
        </Form>
        <Text type="secondary">At least a name, phone, or email is required.</Text>
      </Modal>

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
