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
  cpl?: number | null;
  revenue?: number | null;
  booked?: number | null;
  total_allocation?: number | null;
  post_qa?: number | null;
  achieved?: number | null;
  pending_allocation?: number | null;
  weekly_call?: string | null;
  weekly_report?: string | null;
  additional_comments?: string | null;
  assigned_team_leader_id?: string | null;
  assigned_team_leader_name?: string | null;
  employee_size?: string[] | null;
  revenue_size?: string[] | null;
  abm?: boolean | null;
  seniority?: string | null;
  job_function?: string | null;
  creatives_url?: string[] | null;
  lead_aggregated?: string | null;
  leads?: Lead[];
  last_lead_activity_at?: string | null;
  leads_uploaded?: number;
  leads_audited?: number;
  leads_pending_audit?: number;
  leads_qualified?: number;
  leads_rectified?: number;
  leads_disqualified?: number;
  leads_delivered?: number;
};

type Summary = {
  total_leads_uploaded: number;
  total_audited: number;
  pending_audit: number;
  campaign_count: number;
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
      bodyStyle={{ padding: "18px 20px" }}
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

export type QaCampaignsViewProps = {
  /** UI route prefix, e.g. `/qa/campaigns` or `/emm/campaigns`. */
  basePath?: string;
  /** Roles allowed to view this page. */
  guardRoles?: string[];
  /** React Query key prefix. */
  queryKeyPrefix?: string[];
  /** Excel export filename prefix. */
  exportFilenamePrefix?: string;
  /** Adds a Delivered count column (MIS-delivered leads). */
  showDeliveredColumn?: boolean;
};

export function QaCampaignsView({
  basePath = "/qa/campaigns",
  guardRoles = ["qa", "admin"],
  queryKeyPrefix = ["qa", "campaigns"],
  exportFilenamePrefix = "qa-campaigns-export",
  showDeliveredColumn = false,
}: QaCampaignsViewProps) {
  const router = useRouter();
  const { status } = useRoleGuard(guardRoles);
  const [exporting, setExporting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
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
  }, [dateRange, resetPage]);

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
      return buildListApiUrl("/api/qa/campaigns", {
        start_date: dateRange[0].format("YYYY-MM-DD"),
        end_date: dateRange[1].format("YYYY-MM-DD"),
        tz: clientTimeZone,
        page: exportIds.length > 0 ? 1 : page,
        limit: exportIds.length > 0 ? exportIds.length : pageSize,
        q: debouncedSearch || undefined,
        status: statusFilter || undefined,
        include_leads: opts?.includeLeads ? 1 : undefined,
        campaign_ids: exportIds.length > 0 ? exportIds.join(",") : undefined,
      });
    },
    [dateRange, clientTimeZone, page, pageSize, debouncedSearch, statusFilter]
  );

  const listUrl = buildUrl();
  const listEnabled =
    status === "authorized" &&
    !isOffline &&
    typeof navigator !== "undefined" &&
    navigator.onLine;

  const campaignsQuery = useQuery({
    queryKey: [...queryKeyPrefix, "list", listUrl],
    queryFn: async () => {
      const res = await fetch(listUrl, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      return data as {
        campaigns?: Campaign[];
        summary?: Summary;
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
    refetchInterval: 60 * 60 * 1000,
  });

  const campaigns = useMemo(
    () => campaignsQuery.data?.campaigns ?? [],
    [campaignsQuery.data?.campaigns]
  );
  const summary = campaignsQuery.data?.summary ?? null;

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
          `${missingIds.length} selected campaign(s) have no leads in this date range and were skipped`
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
      downloadExcel(exportLeads, `${exportFilenamePrefix}_${stamp}.xlsx`);
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

  if (status === "loading" || status === "redirecting") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  const list = campaigns;
  const s = summary;
  const campaignStatusColors: Record<string, string> = {
    draft: "default",
    active: "green",
    paused: "orange",
    completed: "success",
  };

  return (
    <div style={{ width: "100%", padding: "0 24px 32px" }}>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={3} style={{ margin: 0, fontWeight: 600 }}>
          Campaigns
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 14, display: "block", marginTop: 4 }}>
          All campaigns. Upload and audit counts reflect the selected date range. Click a row to open
          campaign details.
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
        bodyStyle={{ padding: "16px 20px" }}
      >
        <Row gutter={[12, 12]} align="middle" wrap>
          <Col>
            <Typography.Text type="secondary" style={{ marginRight: 8 }}>
              Upload date range:
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
          <Col flex="auto" style={{ minWidth: 200 }}>
            <Input.Search
              placeholder="Search campaigns (name, client, code, description, industry…)"
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", maxWidth: 360 }}
            />
          </Col>
          <Col>
            <Select
              placeholder="Filter by status"
              allowClear
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "completed", label: "Completed" },
              ]}
              style={{ width: 160 }}
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
          Showing all campaigns. Upload/audit columns count scored leads uploaded between{" "}
          {rangeLabel} (your local timezone).
          {selectedRowKeys.length > 0
            ? ` · ${selectedRowKeys.length} campaign${selectedRowKeys.length !== 1 ? "s" : ""} selected for export.`
            : " · Select campaigns using the checkboxes, then export."}
        </Typography.Text>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="Campaign Count"
            value={(s?.campaign_count ?? 0).toLocaleString()}
            sub="With uploads in range"
            color="#4f46e5"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="Total Leads Uploaded"
            value={(s?.total_leads_uploaded ?? 0).toLocaleString()}
            sub={rangeLabel}
            color="#52c41a"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="Total Audited"
            value={(s?.total_audited ?? 0).toLocaleString()}
            sub="QA status set"
            color="#722ed1"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="Pending Audit"
            value={(s?.pending_audit ?? 0).toLocaleString()}
            sub="Awaiting QA review"
            color="#f59e0b"
          />
        </Col>
      </Row>

      {loading ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : list.length === 0 ? (
        <Empty
          description={
            debouncedSearch || statusFilter
              ? "No campaigns match your search or filters"
              : "No campaigns found"
          }
          style={{ marginTop: 48 }}
        />
      ) : (
        <Card
          bodyStyle={{ padding: 0 }}
          style={{
            borderRadius: 8,
            border: "1px solid #f0f0f0",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          <Table
            className="table-single-line"
            size="middle"
            rowKey="id"
            dataSource={list}
            scroll={{ x: 2044 }}
            tableLayout="fixed"
            pagination={tablePagination}
            rowSelection={rowSelection}
            onRow={(record) => ({
              onClick: (e) => {
                const target = e.target as HTMLElement;
                if (target.closest?.(".ant-checkbox-wrapper, .ant-checkbox, input[type=checkbox]")) {
                  return;
                }
                router.push(`${basePath}/${record.id}`);
              },
              style: { cursor: "pointer" },
              onMouseEnter: (e) => {
                e.currentTarget.style.backgroundColor = "#fafafa";
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.backgroundColor = "";
              },
            })}
            columns={[
              {
                title: "Sr. No.",
                key: "sr",
                width: 72,
                align: "center" as const,
                fixed: "left" as const,
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
                width: 130,
                fixed: "left" as const,
                render: (val: string | null | undefined) => (
                  <Tag color="blue" style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {val || "—"}
                  </Tag>
                ),
              },
              {
                title: "Aggregator",
                dataIndex: "lead_aggregated",
                key: "lead_aggregated",
                width: 160,
                ellipsis: true,
                render: (v: string | null) => tableEllipsisCell(v),
              },
              {
                title: "Campaign",
                dataIndex: "name",
                key: "name",
                ellipsis: true,
                render: (v: string | null) => (
                  <Typography.Text strong style={{ fontSize: 14 }}>
                    {v || "—"}
                  </Typography.Text>
                ),
              },
              {
                title: "Region",
                dataIndex: "geography",
                key: "geography",
                width: 140,
                ellipsis: true,
                render: (v: string | null) => tableEllipsisCell(v),
              },
              {
                title: "Lead Type",
                dataIndex: "lead_type",
                key: "lead_type",
                width: 120,
                ellipsis: true,
                render: (v: string | null) => tableEllipsisCell(v),
              },
              {
                title: "Start Date",
                dataIndex: "start_date",
                key: "start_date",
                width: 120,
                render: (v: string | null) => (
                  <Typography.Text style={{ fontSize: 13 }}>
                    {v ? new Date(v).toLocaleDateString() : "—"}
                  </Typography.Text>
                ),
              },
              {
                title: "End Date",
                dataIndex: "end_date",
                key: "end_date",
                width: 120,
                render: (v: string | null) => (
                  <Typography.Text style={{ fontSize: 13 }}>
                    {v ? new Date(v).toLocaleDateString() : "—"}
                  </Typography.Text>
                ),
              },
              {
                title: "Status",
                dataIndex: "status",
                key: "status",
                width: 100,
                align: "center" as const,
                render: (v: string) => (
                  <Tag
                    color={campaignStatusColors[v] ?? "default"}
                    style={{ textTransform: "capitalize", margin: 0 }}
                  >
                    {v}
                  </Tag>
                ),
              },
              {
                title: "Total Allocation",
                dataIndex: "total_allocation",
                key: "total_allocation",
                width: 120,
                align: "center" as const,
                sorter: (a: Campaign, b: Campaign) =>
                  (a.total_allocation ?? 0) - (b.total_allocation ?? 0),
                render: (v: number | null | undefined) => (
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600 }}>
                    {v != null ? Number(v).toLocaleString() : "—"}
                  </Typography.Text>
                ),
              },
              {
                title: "Achieved",
                dataIndex: "achieved",
                key: "achieved",
                width: 100,
                align: "center" as const,
                sorter: (a: Campaign, b: Campaign) => (a.achieved ?? 0) - (b.achieved ?? 0),
                render: (v: number | null | undefined) => (
                  <Typography.Text
                    style={{ fontSize: 13, fontWeight: 600, color: (v ?? 0) > 0 ? "#2563eb" : undefined }}
                  >
                    {v ?? 0}
                  </Typography.Text>
                ),
              },
              {
                title: "Pending Allocation",
                dataIndex: "pending_allocation",
                key: "pending_allocation",
                width: 140,
                align: "center" as const,
                sorter: (a: Campaign, b: Campaign) =>
                  (a.pending_allocation ?? 0) - (b.pending_allocation ?? 0),
                render: (v: number | null | undefined) => (
                  <Typography.Text
                    style={{ fontSize: 13, fontWeight: 600, color: (v ?? 0) > 0 ? "#d97706" : undefined }}
                  >
                    {v ?? 0}
                  </Typography.Text>
                ),
              },
              {
                title: "Uploaded",
                key: "leads_uploaded",
                width: 88,
                align: "center" as const,
                fixed: "right" as const,
                sorter: (a: Campaign, b: Campaign) =>
                  (a.leads_uploaded ?? 0) - (b.leads_uploaded ?? 0),
                defaultSortOrder: "descend" as const,
                render: (_: unknown, rec: Campaign) => (
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600 }}>
                    {(rec.leads_uploaded ?? 0).toLocaleString()}
                  </Typography.Text>
                ),
              },
              {
                title: "Audited",
                key: "leads_audited",
                width: 88,
                align: "center" as const,
                fixed: "right" as const,
                sorter: (a: Campaign, b: Campaign) =>
                  (a.leads_audited ?? 0) - (b.leads_audited ?? 0),
                render: (_: unknown, rec: Campaign) => (
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: "#722ed1" }}>
                    {(rec.leads_audited ?? 0).toLocaleString()}
                  </Typography.Text>
                ),
              },
              {
                title: "Qualified",
                key: "leads_qualified",
                width: 96,
                align: "center" as const,
                fixed: "right" as const,
                sorter: (a: Campaign, b: Campaign) =>
                  (a.leads_qualified ?? 0) - (b.leads_qualified ?? 0),
                render: (_: unknown, rec: Campaign) => (
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: "#52c41a" }}>
                    {(rec.leads_qualified ?? 0).toLocaleString()}
                  </Typography.Text>
                ),
              },
              {
                title: "Rectified",
                key: "leads_rectified",
                width: 96,
                align: "center" as const,
                fixed: "right" as const,
                sorter: (a: Campaign, b: Campaign) =>
                  (a.leads_rectified ?? 0) - (b.leads_rectified ?? 0),
                render: (_: unknown, rec: Campaign) => (
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b" }}>
                    {(rec.leads_rectified ?? 0).toLocaleString()}
                  </Typography.Text>
                ),
              },
              {
                title: "Disqualified",
                key: "leads_disqualified",
                width: 108,
                align: "center" as const,
                fixed: "right" as const,
                sorter: (a: Campaign, b: Campaign) =>
                  (a.leads_disqualified ?? 0) - (b.leads_disqualified ?? 0),
                render: (_: unknown, rec: Campaign) => (
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: "#ef4444" }}>
                    {(rec.leads_disqualified ?? 0).toLocaleString()}
                  </Typography.Text>
                ),
              },
              {
                title: "Pending",
                key: "leads_pending_audit",
                width: 88,
                align: "center" as const,
                fixed: "right" as const,
                sorter: (a: Campaign, b: Campaign) =>
                  (a.leads_pending_audit ?? 0) - (b.leads_pending_audit ?? 0),
                render: (_: unknown, rec: Campaign) => (
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b" }}>
                    {(rec.leads_pending_audit ?? 0).toLocaleString()}
                  </Typography.Text>
                ),
              },
              ...(showDeliveredColumn
                ? [
                    {
                      title: "Delivered",
                      key: "leads_delivered",
                      width: 96,
                      align: "center" as const,
                      fixed: "right" as const,
                      sorter: (a: Campaign, b: Campaign) =>
                        (a.leads_delivered ?? 0) - (b.leads_delivered ?? 0),
                      render: (_: unknown, rec: Campaign) => (
                        <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>
                          {(rec.leads_delivered ?? 0).toLocaleString()}
                        </Typography.Text>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Card>
      )}
    </div>
  );
}
