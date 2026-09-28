"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card, Button, Table, Tag, Input, message, Spin, Typography, Row, Col, Space,
} from "antd";
import {
  ArrowLeftOutlined,
  FileOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { downloadExcel } from "@/lib/leadsExport";
import { ExpandableText, renderExpandableOverviewValue } from "@/components/ExpandableText";
import { campaignHeaderDisplayCode } from "@/lib/campaign-display";
import { formatEarnedRevenue } from "@/lib/campaign-revenue-metrics";
import { getLeadTableColumns } from "@/components/Leads/LeadTableColumns";
import type { Lead } from "@/types/lead.types";
import dayjs from "dayjs";
import {
  LEADS_TABLE_PAGE_SIZE_DEFAULT,
  LEADS_TABLE_PAGE_SIZE_OPTIONS,
} from "@/lib/leads-table-pagination";

const { Title, Text } = Typography;

type Campaign = {
  id: string;
  campaign_id?: string | null;
  campaign_code?: string | null;
  name: string;
  description: string | null;
  industry: string | null;
  geography: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  lead_type: string | null;
  total_allocation: number | null;
  post_qa: number | null;
  achieved: number | null;
  pending_allocation: number | null;
  additional_comments: string | null;
  employee_size: string[] | null;
  revenue_size: string[] | null;
  abm: boolean | null;
  seniority: string | null;
  job_function: string | null;
  creatives_url: string[] | null;
  cpl: number | null;
  revenue: number | null;
  booked: number | null;
  weekly_call: string | null;
  weekly_report: string | null;
  client_name: string | null;
};

type CampaignFile = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  download_url: string | null;
};

const campaignStatusColors: Record<string, string> = {
  draft: "default", active: "green", paused: "orange", completed: "success",
};

const overviewRowStyle = {
  display: "grid",
  gridTemplateColumns: "160px 1fr",
  gap: 16,
  padding: "10px 0",
  borderBottom: "1px solid #f0f0f0",
  alignItems: "start",
} as const;
const overviewLabelStyle = { fontSize: 13, color: "#6b7280", fontWeight: 500 } as const;
const overviewValueStyle = { fontSize: 14, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const };

function OverviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div style={overviewRowStyle}>
      <span style={overviewLabelStyle}>{label}</span>
      <span style={overviewValueStyle}>{renderExpandableOverviewValue(value, overviewValueStyle)}</span>
    </div>
  );
}

function OverviewRowOrEmpty({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={overviewRowStyle}>
      <span style={overviewLabelStyle}>{label}</span>
      <span style={overviewValueStyle}>{renderExpandableOverviewValue(value ?? "—", overviewValueStyle)}</span>
    </div>
  );
}

export default function DCCampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [files, setFiles] = useState<CampaignFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPageSize, setLeadsPageSize] = useState(LEADS_TABLE_PAGE_SIZE_DEFAULT);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dc/campaigns/${id}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load campaign");
      setCampaign(json.campaign);
      setLeads(json.leads ?? []);
      setFiles(json.files ?? []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load campaign");
      router.replace("/dc/campaigns");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredLeads = leads.filter((l) => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (l.lead_id ?? "").toLowerCase().includes(q) ||
      (l.name ?? "").toLowerCase().includes(q) ||
      ([l.first_name, l.last_name].filter(Boolean).join(" ")).toLowerCase().includes(q) ||
      (l.company_name ?? "").toLowerCase().includes(q) ||
      (l.email ?? "").toLowerCase().includes(q) ||
      (l.phone ?? "").toLowerCase().includes(q)
    );
  });

  useEffect(() => { setLeadsPage(1); }, [leadSearch]);

  const sortedFilteredLeads = [...filteredLeads].sort(
    (a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf()
  );

  const handleExportLeads = () => {
    if (leads.length === 0) {
      message.warning("No leads to export");
      return;
    }
    const slug = (campaign?.name ?? "campaign").replace(/[^\w-]+/g, "-").replace(/-+/g, "-");
    downloadExcel(
      leads,
      `dc-leads-${slug}-${dayjs().format("YYYY-MM-DD")}.xlsx`,
      campaign?.name
    );
    message.success(`Exported ${leads.length} leads with all database fields`);
  };

  if (loading && !campaign) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!campaign) return null;

  const headerCode = campaignHeaderDisplayCode(campaign);

  const leadColumns = getLeadTableColumns({
    showActions: false,
    showDeliveryStatus: true,
    showQaStatus: false,
    showLhoFile: true,
    lhoApiPrefix: "/api/dc/leads",
    pagination: { current: leadsPage, pageSize: leadsPageSize },
  });

  return (
    <div style={{ width: "100%", padding: "0 24px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <Button
          type="primary"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push("/dc/campaigns")}
          style={{ marginBottom: 16 }}
        >
          Back to Campaigns
        </Button>
      </div>

      {/* Header card */}
      <Card
        style={{ marginBottom: 24, borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
        styles={{ body: { padding: "24px 28px" } }}
      >
        <Row gutter={24} align="middle" justify="space-between" wrap>
          <Col flex="1" style={{ minWidth: 0 }}>
            <Title level={3} style={{ margin: 0, marginBottom: 8, fontWeight: 600 }}>
              {campaign.name}
            </Title>
            <Space size="small" wrap>
              {headerCode && (
                <Tag
                  color={headerCode.isStructuredCode ? "blue" : undefined}
                  style={{ fontFamily: "monospace", fontSize: 12, margin: 0 }}
                >
                  {headerCode.text}
                </Tag>
              )}
              <Tag color={campaignStatusColors[campaign.status] ?? "default"} style={{ textTransform: "capitalize", margin: 0 }}>
                {campaign.status}
              </Tag>
              {campaign.lead_type && <Tag style={{ margin: 0 }}>{campaign.lead_type}</Tag>}
              {campaign.client_name && <Tag color="purple" style={{ margin: 0 }}>{campaign.client_name}</Tag>}
              {(campaign.industry || campaign.geography) && (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {[campaign.industry, campaign.geography].filter(Boolean).join(" · ")}
                </Text>
              )}
            </Space>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
              Refresh
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Overview + Files */}
      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Card
            title="Overview"
            style={{ marginBottom: 24, borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
            styles={{ body: { padding: "24px 28px" } }}
          >
            {(campaign.description || campaign.additional_comments) && (
              <div style={{ marginBottom: 20 }}>
                {campaign.description && <OverviewRow label="Description" value={campaign.description} />}
                {campaign.additional_comments && (
                  <div style={overviewRowStyle}>
                    <span style={overviewLabelStyle}>Additional Comments</span>
                    <span style={overviewValueStyle}>
                      <ExpandableText text={campaign.additional_comments} />
                    </span>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0 32px" }}>
              <div>
                <OverviewRowOrEmpty label="Campaign Code" value={headerCode?.text ?? campaign.campaign_code ?? campaign.campaign_id} />
                <OverviewRowOrEmpty label="Lead Type" value={campaign.lead_type} />
                <OverviewRowOrEmpty label="Start Date" value={campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : null} />
                <OverviewRowOrEmpty label="End Date" value={campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : null} />
                <OverviewRowOrEmpty label="Geography" value={campaign.geography} />
                <OverviewRowOrEmpty label="Total Allocation" value={campaign.total_allocation} />
                <OverviewRowOrEmpty label="CPL" value={campaign.cpl != null ? `$${campaign.cpl}` : null} />
                <OverviewRowOrEmpty label="Revenue" value={formatEarnedRevenue(campaign.cpl, campaign.achieved)} />
                <OverviewRowOrEmpty label="Booked" value={campaign.booked != null ? `$${Number(campaign.booked).toLocaleString()}` : null} />
              </div>
              <div>
                <OverviewRowOrEmpty label="Post QA" value={campaign.post_qa} />
                <OverviewRowOrEmpty label="Achieved" value={campaign.achieved} />
                <OverviewRowOrEmpty label="Pending Allocation" value={campaign.pending_allocation} />
              </div>
            </div>
            {(campaign.employee_size?.length || campaign.revenue_size?.length || campaign.industry || campaign.abm != null || campaign.seniority || campaign.job_function || campaign.creatives_url?.length) ? (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Targeting
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0 32px" }}>
                  <div>
                    <OverviewRowOrEmpty label="Employee Size" value={campaign.employee_size?.length ? campaign.employee_size.join(", ") : null} />
                    <OverviewRowOrEmpty label="Revenue Size" value={campaign.revenue_size?.length ? campaign.revenue_size.join(", ") : null} />
                    <OverviewRowOrEmpty label="Industry" value={campaign.industry} />
                    <OverviewRowOrEmpty label="ABM" value={campaign.abm === true ? "Yes" : campaign.abm === false ? "No" : null} />
                  </div>
                  <div>
                    <OverviewRowOrEmpty label="Seniority" value={campaign.seniority} />
                    <OverviewRowOrEmpty label="Job Function" value={campaign.job_function} />
                    {campaign.creatives_url?.length ? (
                      <div style={overviewRowStyle}>
                        <span style={overviewLabelStyle}>Creatives URL</span>
                        <span style={{ ...overviewValueStyle, minWidth: 0, overflow: "hidden" }}>
                          {campaign.creatives_url.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" title={url}
                              style={{ display: "block", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#4f46e5" }}
                            >
                              {url}
                            </a>
                          ))}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title={
              <Space>
                <FileOutlined />
                <span>Files</span>
                <Tag style={{ marginLeft: 4 }}>{files.length}</Tag>
              </Space>
            }
            style={{ marginBottom: 24, borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
            styles={{ body: { padding: "24px 28px" } }}
          >
            {files.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "#6b7280", fontSize: 14 }}>
                <FileOutlined style={{ fontSize: 40, marginBottom: 12, display: "block", color: "#d1d5db" }} />
                No files uploaded for this campaign.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {files.map((f, idx) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 0", borderBottom: idx < files.length - 1 ? "1px solid #f5f5f5" : "none", gap: 12,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                      <FileOutlined style={{ color: "#6b7280", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file_name}</span>
                      {f.file_size != null && (
                        <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                          {(f.file_size / 1024).toFixed(1)} KB
                        </Text>
                      )}
                    </span>
                    {f.download_url && (
                      <Button type="link" size="small" icon={<DownloadOutlined />} href={f.download_url} target="_blank" rel="noopener noreferrer" style={{ padding: "0 4px", flexShrink: 0 }}>
                        Download
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Leads table */}
      <Card
        title={`Leads (${leads.length})`}
        style={{ borderRadius: 8, border: "1px solid #f0f0f0", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
        styles={{ body: { padding: "24px 28px" } }}
        extra={
          <Space size="middle" wrap>
            <Input
              prefix={<SearchOutlined style={{ color: "#6b7280" }} />}
              placeholder="Search leads…"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
            <Button
              icon={<ExportOutlined />}
              onClick={handleExportLeads}
              disabled={leads.length === 0}
            >
              Export
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 12 }}>
          Showing {sortedFilteredLeads.length} of {leads.length} delivered leads (MIS delivered only).
        </Text>
        <Table
          className="table-single-line"
          columns={leadColumns}
          dataSource={sortedFilteredLeads}
          rowKey="id"
          scroll={{ x: 2600 }}
          size="middle"
          pagination={{
            current: leadsPage,
            pageSize: leadsPageSize,
            showSizeChanger: true,
            pageSizeOptions: [...LEADS_TABLE_PAGE_SIZE_OPTIONS],
            showTotal: (t) => `Total ${t} leads`,
            onChange: (page, size) => { setLeadsPage(page); setLeadsPageSize(size); },
          }}
          locale={{
            emptyText: leadSearch
              ? "No delivered leads match the search."
              : "No delivered leads for this campaign yet.",
          }}
        />
      </Card>
    </div>
  );
}
