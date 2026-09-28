"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Row,
  Select,
  Table,
  Tag,
  Typography,
  Spin,
  Empty,
  Space,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import {
  serverTableInitialLoading,
  useServerTablePagination,
  useSyncListPaginationTotal,
} from "@/hooks/useServerTablePagination";
import { buildListApiUrl } from "@/lib/build-list-api-url";
import { tableSerialNumber } from "@/lib/table-pagination";
import { tableEllipsisCell } from "@/lib/table-ellipsis-cell";
import { downloadExcel, enrichLeadsForExport } from "@/lib/leadsExport";
import type { Lead } from "@/types/lead.types";

type Campaign = {
  id: string;
  campaign_id?: string | null;
  campaign_code?: string | null;
  name: string;
  client_name?: string | null;
  description: string | null;
  industry: string | null;
  geography: string | null;
  target_designation?: string | null;
  lead_type?: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at?: string;
  assigned_team_leader_name?: string | null;
  scored_leads_count?: number;
  billable_leads_count?: number;
  qa_pending_leads_count?: number;
  delivered_leads_count?: number;
  client_rejected_leads_count?: number;
  leads?: Lead[];
};

type Summary = {
  campaign_count: number;
  total_scored_leads: number;
  total_qa_pending_leads: number;
  total_delivered_leads: number;
};

const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  draft: "default",
  active: "green",
  paused: "orange",
  completed: "success",
};

function KpiCard({
  title,
  value,
  sub,
  color,
}: {
  title: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <Card
      style={{
        borderRadius: 12,
        border: "1px solid #f0f0f0",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        height: "100%",
      }}
      styles={{ body: { padding: "18px 20px" } }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {title}
      </Typography.Text>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginTop: 4, lineHeight: 1.2 }}>
        {value}
      </div>
      {sub ? (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
          {sub}
        </Typography.Text>
      ) : null}
    </Card>
  );
}

export default function MISTLCampaignsPage() {
  const router = useRouter();
  const { status } = useRoleGuard(["mis", "admin"]);
  const [exporting, setExporting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [leadTypeFilter, setLeadTypeFilter] = useState<string | null>(null);
  const { page, pageSize, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination();
  const [isOffline, setIsOffline] = useState(false);

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(3, "month"),
    dayjs(),
  ]);

  useEffect(() => {
    resetPage();
    setSelectedRowKeys([]);
  }, [dateRange, leadTypeFilter, resetPage]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, statusFilter, resetPage]);

  const clientTimeZone = useMemo(() => {
    if (typeof Intl === "undefined") return "UTC";
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }, []);

  const buildUrl = useCallback(
    (opts?: { includeLeads?: boolean; campaignIds?: string[] }) => {
      const exportIds = opts?.campaignIds ?? [];
      return buildListApiUrl("/api/mis/campaigns", {
        start_date: dateRange[0].format("YYYY-MM-DD"),
        end_date: dateRange[1].format("YYYY-MM-DD"),
        tz: clientTimeZone,
        page: exportIds.length > 0 ? 1 : page,
        limit: exportIds.length > 0 ? exportIds.length : pageSize,
        q: debouncedSearch || undefined,
        status: statusFilter || undefined,
        lead_type: leadTypeFilter || undefined,
        include_leads: opts?.includeLeads ? 1 : undefined,
        campaign_ids: exportIds.length > 0 ? exportIds.join(",") : undefined,
      });
    },
    [dateRange, clientTimeZone, page, pageSize, debouncedSearch, statusFilter, leadTypeFilter]
  );

  const listUrl = buildUrl();
  const listEnabled =
    status === "authorized" &&
    !isOffline &&
    typeof navigator !== "undefined" &&
    navigator.onLine;

  const campaignsQuery = useQuery({
    queryKey: ["mis", "campaigns", "list", listUrl],
    queryFn: async () => {
      const res = await fetch(listUrl, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      return data as {
        campaigns?: Campaign[];
        summary?: Summary;
        lead_types?: string[];
        pagination?: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      };
    },
    enabled: listEnabled,
    placeholderData: (previous) => previous,
  });

  const campaigns = useMemo(
    () => campaignsQuery.data?.campaigns ?? [],
    [campaignsQuery.data?.campaigns]
  );
  const summary = campaignsQuery.data?.summary ?? null;
  const leadTypeOptions = useMemo(
    () => (campaignsQuery.data?.lead_types ?? []).map((t) => ({ value: t, label: t })),
    [campaignsQuery.data?.lead_types]
  );

  useSyncListPaginationTotal(campaignsQuery.data?.pagination, applyPaginationMeta);

  useEffect(() => {
    if (campaignsQuery.error) {
      message.error(
        campaignsQuery.error instanceof Error
          ? campaignsQuery.error.message
          : "Failed to load campaigns"
      );
    }
  }, [campaignsQuery.error]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      void campaignsQuery.refetch();
    };
    const handleOffline = () => setIsOffline(true);

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [campaignsQuery]);

  const loading = serverTableInitialLoading(campaignsQuery.isLoading, campaigns.length);
  const rangeLabel = `${dateRange[0].format("DD MMM YYYY")} – ${dateRange[1].format("DD MMM YYYY")}`;

  const handleExport = async () => {
    const selectedIds = selectedRowKeys.map(String);
    if (selectedIds.length === 0) {
      message.warning("Select one or more campaigns to export");
      return;
    }

    setExporting(true);
    try {
      const res = await fetch(buildUrl({ includeLeads: true, campaignIds: selectedIds }), {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load export data");

      const exportCampaigns = (data.campaigns ?? []) as Campaign[];
      const returnedIds = new Set(exportCampaigns.map((c) => c.id));
      const missingIds = selectedIds.filter((id) => !returnedIds.has(id));
      if (missingIds.length > 0) {
        message.warning(
          `${missingIds.length} selected campaign(s) have no scored leads in this date range and were skipped`
        );
      }

      const exportLeads = exportCampaigns.flatMap((c) =>
        enrichLeadsForExport(
          (c.leads ?? []) as Lead[],
          c.name,
          c.lead_type,
          c.assigned_team_leader_name
        )
      );
      if (exportLeads.length === 0) {
        message.warning("No leads to export for the selected campaigns in this date range");
        return;
      }

      const stamp = `${dateRange[0].format("YYYY-MM-DD")}_${dateRange[1].format("YYYY-MM-DD")}`;
      downloadExcel(exportLeads, `mis-campaigns-export_${stamp}.xlsx`);
      message.success(
        `Exported ${exportLeads.length} leads from ${exportCampaigns.length} campaign${exportCampaigns.length !== 1 ? "s" : ""} (${rangeLabel})`
      );
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
    preserveSelectedRowKeys: true,
    columnWidth: 48,
  };

  const columns: ColumnsType<Campaign> = useMemo(
    () => [
      {
        title: "Sr. No.",
        key: "sr",
        width: 72,
        fixed: "left",
        align: "center",
        render: (_: unknown, __: Campaign, index: number) => (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {tableSerialNumber(page, pageSize, index)}
          </Typography.Text>
        ),
      },
      {
        title: "Campaign Code",
        dataIndex: "campaign_code",
        key: "campaign_code",
        width: 120,
        fixed: "left",
        ellipsis: true,
        render: (val: string | null | undefined) => (
          <Tag color="blue" style={{ fontFamily: "monospace", fontSize: 12, margin: 0 }}>
            {val || "—"}
          </Tag>
        ),
      },
      {
        title: "Campaign",
        dataIndex: "name",
        key: "name",
        width: 200,
        ellipsis: { showTitle: false },
        className: "table-col-campaign-name",
        render: (v: string | null) => tableEllipsisCell(v),
      },
      {
        title: "Lead Type",
        dataIndex: "lead_type",
        key: "lead_type",
        width: 110,
        ellipsis: true,
        render: (v: string | null) => tableEllipsisCell(v),
      },
      {
        title: "Industry",
        dataIndex: "industry",
        key: "industry",
        width: 160,
        ellipsis: { showTitle: false },
        className: "table-col-campaign-name",
        render: (v: string | null) => tableEllipsisCell(v),
      },
      {
        title: "Geography",
        dataIndex: "geography",
        key: "geography",
        width: 110,
        ellipsis: true,
        render: (v: string | null) => tableEllipsisCell(v),
      },
      {
        title: "Start Date",
        dataIndex: "start_date",
        key: "start_date",
        width: 108,
        responsive: ["md"],
        render: (v: string | null) => (
          <Typography.Text style={{ fontSize: 13, whiteSpace: "nowrap" }}>
            {v ? new Date(v).toLocaleDateString() : "—"}
          </Typography.Text>
        ),
      },
      {
        title: "End Date",
        dataIndex: "end_date",
        key: "end_date",
        width: 108,
        responsive: ["md"],
        render: (v: string | null) => (
          <Typography.Text style={{ fontSize: 13, whiteSpace: "nowrap" }}>
            {v ? new Date(v).toLocaleDateString() : "—"}
          </Typography.Text>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        width: 96,
        align: "center",
        render: (v: string) => (
          <Tag
            color={CAMPAIGN_STATUS_COLORS[v] ?? "default"}
            style={{ textTransform: "capitalize", margin: 0 }}
          >
            {v}
          </Tag>
        ),
      },
      {
        title: "Billable Leads",
        dataIndex: "billable_leads_count",
        key: "billable_leads_count",
        width: 120,
        align: "center",
        render: (v: number | undefined) => {
          const count = v ?? 0;
          return (
            <Tag color={count > 0 ? "cyan" : "default"} style={{ margin: 0, fontWeight: 600 }}>
              {count}
            </Tag>
          );
        },
      },
      {
        title: "Leads",
        dataIndex: "scored_leads_count",
        key: "scored_leads_count",
        width: 80,
        align: "center",
        fixed: "right",
        sorter: (a, b) => (a.scored_leads_count ?? 0) - (b.scored_leads_count ?? 0),
        sortDirections: ["descend", "ascend"] as const,
        render: (v: number | undefined) => (
          <Typography.Text style={{ fontSize: 13, fontWeight: 600 }}>
            {v ?? 0}
          </Typography.Text>
        ),
      },
      {
        title: "QA Pending",
        dataIndex: "qa_pending_leads_count",
        key: "qa_pending_leads_count",
        width: 104,
        align: "center",
        fixed: "right",
        sorter: (a, b) => (a.qa_pending_leads_count ?? 0) - (b.qa_pending_leads_count ?? 0),
        sortDirections: ["descend", "ascend"] as const,
        render: (v: number | undefined) => {
          const count = v ?? 0;
          return (
            <Typography.Text
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: count > 0 ? "#d97706" : undefined,
              }}
            >
              {count}
            </Typography.Text>
          );
        },
      },
      {
        title: "Delivered",
        dataIndex: "delivered_leads_count",
        key: "delivered_leads_count",
        width: 96,
        align: "center",
        fixed: "right",
        sorter: (a, b) => (a.delivered_leads_count ?? 0) - (b.delivered_leads_count ?? 0),
        sortDirections: ["descend", "ascend"] as const,
        render: (v: number | undefined) => {
          const count = v ?? 0;
          return (
            <Typography.Text
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: count > 0 ? "#16a34a" : undefined,
              }}
            >
              {count}
            </Typography.Text>
          );
        },
      },
      {
        title: "Client Rejected",
        dataIndex: "client_rejected_leads_count",
        key: "client_rejected_leads_count",
        width: 128,
        align: "center",
        fixed: "right",
        sorter: (a, b) =>
          (a.client_rejected_leads_count ?? 0) - (b.client_rejected_leads_count ?? 0),
        sortDirections: ["descend", "ascend"] as const,
        render: (v: number | undefined) => {
          const count = v ?? 0;
          return (
            <Typography.Text
              style={{ fontSize: 13, fontWeight: 600, color: count > 0 ? "#dc2626" : undefined }}
            >
              {count}
            </Typography.Text>
          );
        },
      },
    ],
    [page, pageSize]
  );

  if (status === "loading" || status === "redirecting") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        padding: "0 clamp(12px, 2vw, 24px) 32px",
        overflowX: "hidden",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={3} style={{ margin: 0, fontWeight: 600 }}>
          Campaigns
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 14, display: "block", marginTop: 4 }}>
          Scored lead counts reflect the selected date range. Select campaigns and export with their
          leads.
        </Typography.Text>
      </div>

      {isOffline && (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text type="danger" style={{ fontSize: 14 }}>
            You appear to be offline. Data will reload when you are back online, or{" "}
            <a
              onClick={(e) => {
                e.preventDefault();
                void campaignsQuery.refetch();
              }}
            >
              retry now
            </a>
            .
          </Typography.Text>
        </div>
      )}

      <Card
        style={{
          marginBottom: 20,
          borderRadius: 12,
          border: "1px solid #f0f0f0",
          boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        }}
        styles={{ body: { padding: "16px 20px" } }}
      >
        <Row gutter={[12, 12]} align="middle" wrap>
          <Col>
            <Typography.Text type="secondary" style={{ marginRight: 8 }}>
              Lead upload date:
            </Typography.Text>
          </Col>
          <Col>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates?.[0] && dates?.[1]) {
                  setDateRange([dates[0], dates[1]]);
                }
              }}
              allowClear={false}
              format="DD MMM YYYY"
              style={{ width: 280 }}
            />
          </Col>
          <Col flex="auto" style={{ minWidth: 180 }}>
            <Input.Search
              placeholder="Search campaigns (name, code, industry, geography…)"
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", maxWidth: 320 }}
            />
          </Col>
          <Col>
            <Select
              placeholder="Lead type"
              allowClear
              showSearch
              optionFilterProp="label"
              value={leadTypeFilter}
              onChange={setLeadTypeFilter}
              options={leadTypeOptions}
              style={{ width: 160 }}
            />
          </Col>
          <Col>
            <Select
              placeholder="Status"
              allowClear
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "completed", label: "Completed" },
              ]}
              style={{ width: 140 }}
            />
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void campaignsQuery.refetch()}
                loading={campaignsQuery.isFetching && !loading}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleExport}
                loading={exporting}
                disabled={loading || selectedRowKeys.length === 0}
              >
                Export{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ""}
              </Button>
            </Space>
          </Col>
        </Row>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 10 }}>
          Leads, QA Pending &amp; Delivered columns count scored leads uploaded between {rangeLabel} (your local
          timezone). QA Pending = leads not yet QA-reviewed.
          {selectedRowKeys.length > 0
            ? ` · ${selectedRowKeys.length} campaign${selectedRowKeys.length !== 1 ? "s" : ""} selected for export.`
            : " · Select campaigns using the checkboxes, then export with leads."}
        </Typography.Text>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            title="Active Campaigns"
            value={(summary?.campaign_count ?? 0).toLocaleString()}
            sub="With scored uploads in range"
            color="#4f46e5"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            title="Scored Leads"
            value={(summary?.total_scored_leads ?? 0).toLocaleString()}
            sub={rangeLabel}
            color="#16a34a"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            title="QA Pending"
            value={(summary?.total_qa_pending_leads ?? 0).toLocaleString()}
            sub="Awaiting QA review"
            color="#d97706"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            title="Delivered Leads"
            value={(summary?.total_delivered_leads ?? 0).toLocaleString()}
            sub={rangeLabel}
            color="#ea580c"
          />
        </Col>
      </Row>

      {loading ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : campaigns.length === 0 ? (
        <Empty description="No campaigns match your filters" style={{ marginTop: 48 }} />
      ) : (
        <Card
          styles={{ body: { padding: 0, overflow: "hidden" } }}
          style={{
            borderRadius: 8,
            border: "1px solid #f0f0f0",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            overflow: "hidden",
          }}
        >
          <Table
            className="table-single-line mis-campaigns-table"
            size="middle"
            rowKey="id"
            rowSelection={rowSelection}
            dataSource={campaigns}
            columns={columns}
            scroll={{ x: 1424 }}
            tableLayout="fixed"
            sticky
            pagination={tablePagination}
            onRow={(record) => ({
              onClick: () => router.push(`/mis/campaigns/${record.id}`),
              style: { cursor: "pointer" },
              onMouseEnter: (e) => {
                e.currentTarget.style.backgroundColor = "#fafafa";
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.backgroundColor = "";
              },
            })}
          />
        </Card>
      )}
    </div>
  );
}
