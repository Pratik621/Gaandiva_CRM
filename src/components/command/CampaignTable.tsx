"use client";

import React, { useState } from "react";
import type { HTMLAttributes } from "react";
import { Table, Tag, Tooltip } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import Link from "next/link";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import CampaignPerformancePredictionBar from "@/components/command/CampaignPerformancePredictionBar";
import { tableSerialNumber } from "@/lib/table-pagination";

dayjs.extend(customParseFormat);

interface CampaignMetrics {
  sponsor_name?: string | null;
  total_leads_allocated?: number | null;
  total_campaign_spend?: number | null;
  total_leads_delivered?: number | null;
  daily_reporting?: unknown;
  channel_split?: unknown;
  deficit_leads?: number | null;
  lead_increment?: number | null;
  lead_replace?: number | null;
}

export interface CampaignListStats {
  total_leads: number;
  /** MIS-delivered leads (`delivery_status = 'delivered'`). */
  delivered_count: number;
  qualified_count: number;
  qualified_pct: number;
  /** % of leads past QA (qualified / registered / attended / no_show). */
  qa_verified_pct: number;
  /** dq_override alert rows for this campaign. */
  override_count: number;
  /** Leads with missing or disputed consent. */
  consent_issues_count: number;
  dq_count: number;
  unresolved_alerts: number;
}

export interface CommandCampaignRow {
  id: string;
  campaign_id: string;
  campaign_code?: string | null;
  name: string;
  created_by_name?: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  client_name: string | null;
  lead_type: string | null;
  campaign_type?: string | null;
  cpl: number | null;
  total_allocation: number | null;
  achieved: number | null;
  pending_allocation?: number | null;
  industry: string | null;
  geography: string | null;
  campaign_metrics?: CampaignMetrics | CampaignMetrics[];
  list_stats?: CampaignListStats;
}

interface CampaignTableProps {
  campaigns: CommandCampaignRow[];
  loading?: boolean;
  /** Simplified columns for Client Viewer on /dashboard/campaigns */
  clientViewer?: boolean;
  /** Server-driven pagination; omit for local client pagination */
  pagination?: TablePaginationConfig;
  page?: number;
  pageSize?: number;
}

function achievedLeadCount(row: CommandCampaignRow): number {
  if (row.achieved != null && !Number.isNaN(Number(row.achieved))) {
    return Number(row.achieved);
  }
  return row.list_stats?.delivered_count ?? 0;
}

function remainingAllocation(row: CommandCampaignRow): number {
  const total = row.total_allocation ?? 0;
  return Math.max(0, total - achievedLeadCount(row));
}

function countPillStyle(color: string, bg: string): React.CSSProperties {
  return {
    display: "inline-block",
    minWidth: 56,
    padding: "4px 12px",
    borderRadius: 999,
    background: bg,
    color,
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1.2,
    border: `1px solid ${color}33`,
    textAlign: "center",
  };
}

const STATUS_TAG_PROPS: Record<string, { color: string }> = {
  active: { color: "success" },
  paused: { color: "warning" },
  completed: { color: "success" },
  cancelled: { color: "error" },
  draft: { color: "default" },
};

function formatLocalDate(iso: string | null): string {
  if (!iso) return "—";
  const strict = dayjs(iso, "YYYY-MM-DD", true);
  if (strict.isValid()) return strict.format("MMM D, YYYY");
  return dayjs(iso).format("MMM D, YYYY");
}

/** Keeps sortable headers on one line; minWidth stops flex layout from crushing columns. */
function headerCellProps(minWidth: number, fixedBg = false) {
  return (): HTMLAttributes<HTMLTableCellElement> => ({
    style: {
      whiteSpace: "nowrap",
      minWidth,
      ...(fixedBg ? { background: "#fafafa" } : {}),
    },
  });
}

function fixedBodyCellProps(minWidth: number) {
  return (): HTMLAttributes<HTMLTableCellElement> => ({
    style: { minWidth, whiteSpace: "nowrap", background: "#fff" },
  });
}

/** Min scroll width for Client Viewer columns (enables horizontal scroll + fixed columns). */
const CLIENT_VIEWER_CAMPAIGN_NAME_WIDTH = 180;
const LEAD_TYPE_COL_WIDTH = 140;
const REMAINING_ALLOCATION_COL_WIDTH = 140;
const CAMPAIGN_HEALTH_COL_WIDTH = 160;

const CLIENT_VIEWER_SCROLL_X =
  72 +
  CLIENT_VIEWER_CAMPAIGN_NAME_WIDTH +
  180 +
  LEAD_TYPE_COL_WIDTH +
  124 +
  136 +
  136 +
  140 +
  120 +
  CAMPAIGN_HEALTH_COL_WIDTH +
  REMAINING_ALLOCATION_COL_WIDTH;

export default function CampaignTable({
  campaigns,
  loading,
  clientViewer,
  pagination: paginationProp,
  page: pageProp,
  pageSize: pageSizeProp,
}: CampaignTableProps) {
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(25);
  const page = pageProp ?? localPage;
  const pageSize = pageSizeProp ?? localPageSize;

  const clientViewerColumns: ColumnsType<CommandCampaignRow> = [
    {
      title: "Sr. No.",
      key: "sr",
      width: 72,
      align: "center",
      fixed: "left",
      onHeaderCell: headerCellProps(72, true),
      onCell: fixedBodyCellProps(72),
      render: (_: unknown, __: CommandCampaignRow, index: number) =>
        tableSerialNumber(page, pageSize, index),
    },
    {
      title: "Campaign Name",
      key: "name",
      width: CLIENT_VIEWER_CAMPAIGN_NAME_WIDTH,
      ellipsis: { showTitle: false },
      fixed: "left",
      className: "table-col-campaign-name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      onHeaderCell: headerCellProps(CLIENT_VIEWER_CAMPAIGN_NAME_WIDTH, true),
      onCell: fixedBodyCellProps(CLIENT_VIEWER_CAMPAIGN_NAME_WIDTH),
      render: (_, row) => {
        const name = row.name?.trim() || "—";
        if (name === "—") return name;
        return (
          <Tooltip title={name}>
            <Link
              href={`/dashboard/campaigns/${row.id}`}
              className="table-text-ellipsis"
              style={{ fontWeight: 600, display: "block", maxWidth: "100%" }}
            >
              {name}
            </Link>
          </Tooltip>
        );
      },
    },
    {
      title: "Created By",
      dataIndex: "created_by_name",
      key: "created_by_name",
      width: 180,
      ellipsis: true,
      sorter: (a, b) => (a.created_by_name ?? "").localeCompare(b.created_by_name ?? ""),
      onHeaderCell: headerCellProps(180),
      onCell: () => ({ style: { minWidth: 180, whiteSpace: "nowrap" } }),
      render: (name: string | null | undefined) => name || "—",
    },
    {
      title: "Lead Type",
      dataIndex: "lead_type",
      key: "lead_type",
      width: LEAD_TYPE_COL_WIDTH,
      ellipsis: true,
      sorter: (a, b) => (a.lead_type ?? "").localeCompare(b.lead_type ?? ""),
      onHeaderCell: headerCellProps(LEAD_TYPE_COL_WIDTH),
      onCell: () => ({ style: { minWidth: LEAD_TYPE_COL_WIDTH, whiteSpace: "nowrap" } }),
      render: (v: string | null | undefined) => v?.trim() || "—",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 124,
      sorter: (a, b) => a.status.localeCompare(b.status),
      onHeaderCell: headerCellProps(124),
      onCell: () => ({ style: { minWidth: 124 } }),
      render: (status: string) => {
        const s = String(status ?? "").toLowerCase();
        const tag = STATUS_TAG_PROPS[s] ?? { color: "default" };
        const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
        return (
          <Tag color={tag.color}>{label}</Tag>
        );
      },
    },
    {
      title: "Start Date",
      dataIndex: "start_date",
      key: "start_date",
      width: 136,
      sorter: (a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""),
      onHeaderCell: headerCellProps(136),
      onCell: () => ({ style: { minWidth: 136, whiteSpace: "nowrap" } }),
      render: (d: string | null) => (
        <span style={{ fontSize: 13 }}>{formatLocalDate(d)}</span>
      ),
    },
    {
      title: "End Date",
      dataIndex: "end_date",
      key: "end_date",
      width: 136,
      sorter: (a, b) => (a.end_date ?? "").localeCompare(b.end_date ?? ""),
      onHeaderCell: headerCellProps(136),
      onCell: () => ({ style: { minWidth: 136, whiteSpace: "nowrap" } }),
      render: (d: string | null) => (
        <span style={{ fontSize: 13 }}>{formatLocalDate(d)}</span>
      ),
    },
    {
      title: "Total Allocation",
      dataIndex: "total_allocation",
      key: "total_allocation",
      width: 140,
      align: "center",
      sorter: (a, b) => (a.total_allocation ?? 0) - (b.total_allocation ?? 0),
      onHeaderCell: headerCellProps(140),
      onCell: () => ({ style: { minWidth: 140, whiteSpace: "nowrap", textAlign: "center" } }),
      render: (v: number | null) => (
        <span style={countPillStyle("#4f46e5", "#eef2ff")}>
          {v != null ? v.toLocaleString() : "—"}
        </span>
      ),
    },
    {
      title: "Achieved",
      dataIndex: "achieved",
      key: "achieved",
      width: 120,
      align: "center",
      sorter: (a, b) => achievedLeadCount(a) - achievedLeadCount(b),
      onHeaderCell: headerCellProps(120),
      onCell: () => ({ style: { minWidth: 120, whiteSpace: "nowrap", textAlign: "center" } }),
      render: (_v: number | null, row) => {
        const n = achievedLeadCount(row);
        const hasValue = n > 0 || row.achieved === 0 || row.list_stats != null;
        return (
          <span style={countPillStyle("#389e0d", "#f6ffed")}>
            {hasValue ? n.toLocaleString() : "—"}
          </span>
        );
      },
    },
    {
      title: "Campaign Health",
      key: "campaign_health",
      width: CAMPAIGN_HEALTH_COL_WIDTH,
      align: "center",
      fixed: "right",
      className: "table-col-campaign-health",
      onHeaderCell: headerCellProps(CAMPAIGN_HEALTH_COL_WIDTH, true),
      onCell: () => ({
        style: {
          minWidth: CAMPAIGN_HEALTH_COL_WIDTH,
          whiteSpace: "nowrap",
          background: "#fff",
          textAlign: "center",
        },
      }),
      render: (_, row) => {
        if ((row.total_allocation ?? 0) <= 0) return "—";
        return (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <CampaignPerformancePredictionBar row={row} />
          </div>
        );
      },
    },
    {
      title: "Remaining Allocation",
      key: "remaining_allocation",
      width: REMAINING_ALLOCATION_COL_WIDTH,
      align: "center",
      fixed: "right",
      className: "table-col-remaining-allocation",
      sorter: (a, b) => remainingAllocation(a) - remainingAllocation(b),
      onHeaderCell: headerCellProps(REMAINING_ALLOCATION_COL_WIDTH, true),
      onCell: () => ({
        style: {
          minWidth: REMAINING_ALLOCATION_COL_WIDTH,
          whiteSpace: "nowrap",
          background: "#fff",
          textAlign: "center",
        },
      }),
      render: (_, row) => {
        const n = remainingAllocation(row);
        const total = row.total_allocation ?? 0;
        const exhausted = total > 0 && n === 0;
        return (
          <span
            style={countPillStyle(
              exhausted ? "#52c41a" : "#b91c1c",
              exhausted ? "#f6ffed" : "#fff2e8"
            )}
          >
            {n.toLocaleString()}
          </span>
        );
      },
    },
  ];

  const commandColumns: ColumnsType<CommandCampaignRow> = [
    {
      title: "Campaign Code",
      dataIndex: "campaign_code",
      key: "campaign_code",
      width: 130,
      onHeaderCell: headerCellProps(130),
      onCell: () => ({ style: { minWidth: 130, whiteSpace: "nowrap" } }),
      render: (val: string | null | undefined) => (
        <Tag color="blue" style={{ fontFamily: "monospace", fontSize: 12 }}>
          {val || "—"}
        </Tag>
      ),
    },
    {
      title: "Campaign Name",
      key: "name",
      width: 280,
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      onHeaderCell: headerCellProps(280),
      onCell: () => ({ style: { minWidth: 200, maxWidth: 360 } }),
      render: (_, row) => (
        <Link href={`/dashboard/campaigns/${row.id}`} style={{ fontWeight: 600 }}>
          {row.name}
        </Link>
      ),
    },
    {
      title: "Created By",
      dataIndex: "created_by_name",
      key: "created_by_name",
      width: 180,
      ellipsis: true,
      sorter: (a, b) => (a.created_by_name ?? "").localeCompare(b.created_by_name ?? ""),
      onHeaderCell: headerCellProps(180),
      onCell: () => ({ style: { minWidth: 180, whiteSpace: "nowrap" } }),
      render: (name: string | null | undefined) => name || "—",
    },
    {
      title: "Lead Type",
      dataIndex: "lead_type",
      key: "lead_type",
      width: LEAD_TYPE_COL_WIDTH,
      ellipsis: true,
      sorter: (a, b) => (a.lead_type ?? "").localeCompare(b.lead_type ?? ""),
      onHeaderCell: headerCellProps(LEAD_TYPE_COL_WIDTH),
      onCell: () => ({ style: { minWidth: LEAD_TYPE_COL_WIDTH, whiteSpace: "nowrap" } }),
      render: (v: string | null | undefined) => v?.trim() || "—",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 124,
      sorter: (a, b) => a.status.localeCompare(b.status),
      onHeaderCell: headerCellProps(124),
      onCell: () => ({ style: { minWidth: 124 } }),
      render: (status: string) => {
        const s = String(status ?? "").toLowerCase();
        const tag = STATUS_TAG_PROPS[s] ?? { color: "default" };
        const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
        return (
          <Tag color={tag.color}>{label}</Tag>
        );
      },
    },
    {
      title: "Start Date",
      dataIndex: "start_date",
      key: "start_date",
      width: 136,
      sorter: (a, b) => {
        const x = a.start_date ?? "";
        const y = b.start_date ?? "";
        return x.localeCompare(y);
      },
      onHeaderCell: headerCellProps(136),
      onCell: () => ({ style: { minWidth: 136, whiteSpace: "nowrap" } }),
      render: (d: string | null) => (
        <span style={{ fontSize: 13 }}>{formatLocalDate(d)}</span>
      ),
    },
    {
      title: "End Date",
      dataIndex: "end_date",
      key: "end_date",
      width: 136,
      sorter: (a, b) => {
        const x = a.end_date ?? "";
        const y = b.end_date ?? "";
        return x.localeCompare(y);
      },
      onHeaderCell: headerCellProps(136),
      onCell: () => ({ style: { minWidth: 136, whiteSpace: "nowrap" } }),
      render: (d: string | null) => (
        <span style={{ fontSize: 13 }}>{formatLocalDate(d)}</span>
      ),
    },
    {
      title: "Total Leads",
      key: "total_leads",
      width: 118,
      sorter: (a, b) =>
        (a.list_stats?.total_leads ?? 0) - (b.list_stats?.total_leads ?? 0),
      onHeaderCell: headerCellProps(118),
      onCell: () => ({ style: { minWidth: 118, whiteSpace: "nowrap" } }),
      render: (_, row) => (
        <span style={{ fontWeight: 500 }}>{row.list_stats?.total_leads ?? 0}</span>
      ),
    },
    {
      title: "Qualified %",
      key: "qualified_pct",
      width: 132,
      align: "right",
      sorter: (a, b) =>
        (a.list_stats?.qualified_pct ?? 0) - (b.list_stats?.qualified_pct ?? 0),
      onHeaderCell: headerCellProps(132),
      onCell: () => ({ style: { minWidth: 132, whiteSpace: "nowrap" } }),
      render: (_, row) => {
        const p = row.list_stats?.qualified_pct ?? 0;
        return <span>{`${p}%`}</span>;
      },
    },
    {
      title: "DQ Count",
      key: "dq_count",
      width: 108,
      align: "right",
      sorter: (a, b) => (a.list_stats?.dq_count ?? 0) - (b.list_stats?.dq_count ?? 0),
      onHeaderCell: headerCellProps(108),
      onCell: () => ({ style: { minWidth: 108, whiteSpace: "nowrap" } }),
      render: (_, row) => <span>{row.list_stats?.dq_count ?? 0}</span>,
    },
    {
      title: "Alerts Count",
      key: "alerts_count",
      width: 128,
      align: "right",
      sorter: (a, b) =>
        (a.list_stats?.unresolved_alerts ?? 0) - (b.list_stats?.unresolved_alerts ?? 0),
      onHeaderCell: headerCellProps(128),
      onCell: () => ({ style: { minWidth: 128, whiteSpace: "nowrap" } }),
      render: (_, row) => {
        const n = row.list_stats?.unresolved_alerts ?? 0;
        return (
          <Link
            href={`/dashboard/campaigns/${row.id}?tab=alerts&alerts_filter=unresolved`}
            prefetch={false}
            style={{ fontWeight: n > 0 ? 600 : 400 }}
            aria-label="Open unresolved alerts for this campaign"
          >
            {n}
          </Link>
        );
      },
    },
  ];

  const columns = clientViewer ? clientViewerColumns : commandColumns;

  return (
    <Table<CommandCampaignRow>
      className={clientViewer ? "table-single-line" : undefined}
      columns={columns}
      dataSource={campaigns}
      rowKey="id"
      loading={loading ?? false}
      size="middle"
      tableLayout="fixed"
      scroll={{ x: clientViewer ? CLIENT_VIEWER_SCROLL_X : "max-content" }}
      pagination={
        paginationProp ?? {
          current: localPage,
          pageSize: localPageSize,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50, 100],
          showTotal: (t) => `${t} campaigns`,
          onChange: (nextPage, nextSize) => {
            setLocalPage(nextPage);
            setLocalPageSize(nextSize ?? 25);
          },
        }
      }
      style={{ background: "#fff", borderRadius: 8 }}
    />
  );
}
