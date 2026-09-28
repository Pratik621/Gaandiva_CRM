"use client";

import React from "react";
import type { HTMLAttributes } from "react";
import { Table, Tag, Button, message, Select, Tooltip } from "antd";
import type { TableProps } from "antd";
import type { ColumnsType, ColumnType } from "antd/es/table";
import { EditOutlined, CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Lead } from "@/types/lead.types";
import { BILLABLE_STATUS_OPTIONS } from "@/lib/leads/billable-status";
import { LeadTableRecordingCell } from "@/components/Leads/LeadTableRecordingCell";
import { tableSerialNumber } from "@/lib/table-pagination";
import { useAuth } from "@/context/AuthContext";
import { generateLhoPdf } from "@/lib/generateLhoPdf";
import { buildLhoDataFromLead } from "@/lib/lho/build-lho-data";
import { resolveCampaignQuestionsFromLeadRaw } from "@/lib/lho/campaign-cq-pdf";
import { shouldGenerateLhoPdfWithLogo } from "@/lib/lho/logo-pdf";
import {
  LEAD_MEETING_DATE_TIME_LABEL,
  LEAD_MEETING_SET_DATE_TIME_LABEL,
} from "@/lib/lead-field-labels";

export { BILLABLE_STATUS_OPTIONS };

const STATUS_COLORS: Record<string, string> = {
  new: "default",
  contacted: "processing",
  interested: "green",
  followup: "gold",
  closed_won: "blue",
  closed_lost: "red",
};

type ColumnConfig = {
  showActions?: boolean;
  onEdit?: (lead: Lead) => void;
  showDeliveryStatus?: boolean;
  /** Show the MIS-only billable status selector after Delivery. */
  showBillableStatus?: boolean;
  onBillableStatusChange?: (lead: Lead, status: string | null) => void;
  /** Adds Client Rejected to the Delivery dropdown. */
  allowClientRejectedDelivery?: boolean;
  /** When false, shows Meeting Date & Time instead of QA Status. */
  showQaStatus?: boolean;
  /** When false, hides the Date Meeting Set column. */
  showMeetingSetDate?: boolean;
  /** When false with showQaStatus false, hides the Meeting Date & Time column. */
  showAppointment?: boolean;
  /** Download LHO file column (beside meeting datetime); uses command LHO API. */
  showLhoFile?: boolean;
  /**
   * When false, Date Meeting Set / Meeting Date & Time / LHO file are not sticky (fixed right).
   * Default true.
   */
  pinMeetingAndLhoColumns?: boolean;
  /** API prefix for LHO list, e.g. `/api/command/leads`. */
  lhoApiPrefix?: string;
  onMarkDelivered?: (lead: Lead) => void;
  markingDeliveredLeadId?: string | null;
  onDeliveryStatusChange?: (
    lead: Lead,
    status: "pending" | "not_delivered" | "delivered" | "client_rejected"
  ) => void;
  /** Pass when the table uses pagination so Sr. No. continues across pages. */
  pagination?: { current: number; pageSize: number };
  /** Hide the Follow-up date column (default: shown). Pass false for Agent role. */
  showFollowupDate?: boolean;
  /** Hide the Channel column (default: shown). */
  showChannel?: boolean;
  /** Show QA auditor name column (qa_name). */
  showAuditBy?: boolean;
  /** Show lead uploader / creator column (created_by_name). Default true. */
  showCreatedBy?: boolean;
  /** Show Created (created_at) column. Default true. */
  showCreatedAt?: boolean;
  /** Inline voice log play/upload (agent campaign leads table). */
  showVoiceRecordings?: boolean;
  onVoiceRecordingsChange?: () => void;
};

function formatLeadDateTimeCell(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const d = dayjs(value);
  if (!d.isValid()) return "—";
  return d.format("MMM D, YYYY, h:mm A");
}

function DeliveryStatusTooltipContent({ record }: { record: Lead }) {
  const deliveredAt = record.delivered_at
    ? dayjs(record.delivered_at).format("MMM D, YYYY · h:mm A")
    : null;
  const deliveredBy = record.delivered_by_name?.trim() || null;

  if (!deliveredAt && !deliveredBy) {
    return (
      <span style={{ fontSize: 12, lineHeight: 1.5 }}>
        Re-select <strong>Delivered</strong> to record date and MIS user.
      </span>
    );
  }

  return (
    <div style={{ fontSize: 12, lineHeight: 1.55 }}>
      {deliveredAt && <div style={{ fontWeight: 600 }}>{deliveredAt}</div>}
      {deliveredBy && (
        <div style={{ marginTop: deliveredAt ? 4 : 0, opacity: 0.92 }}>By {deliveredBy}</div>
      )}
    </div>
  );
}

function leadDisplayNameForFile(lead: Lead): string {
  const full = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  const name = lead.name?.trim();
  if (name) return name;
  const company = lead.company_name?.trim();
  if (company) return company;
  return lead.lead_id?.trim() || lead.id;
}

function sanitizeDownloadFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-\s]/g, "_").replace(/\s+/g, " ").trim().slice(0, 200);
}

function fileExtensionFromStorageName(storageName: string): string {
  const base = storageName.includes("/") ? storageName.split("/").pop()! : storageName;
  const stripped = base.replace(/^[0-9a-f-]{36}_/i, "");
  const dot = stripped.lastIndexOf(".");
  return dot >= 0 ? stripped.slice(dot) : "";
}

async function downloadLeadLhoFile(
  lead: Lead,
  apiPrefix: string
): Promise<void> {
  const hide = message.loading("Preparing download…", 0);
  try {
    const res = await fetch(`${apiPrefix}/${lead.id}/lho`);
    const json = (await res.json()) as {
      error?: string;
      files?: { name: string; url: string | null }[];
    };
    if (!res.ok) {
      message.error(json.error ?? "Failed to load LHO file");
      return;
    }
    const file = json.files?.find((f) => f.url);
    if (!file?.url) {
      message.warning("No LHO file uploaded for this lead");
      return;
    }
    const blobRes = await fetch(file.url);
    if (!blobRes.ok) {
      message.error("Failed to download LHO file");
      return;
    }
    const blob = await blobRes.blob();
    const ext = fileExtensionFromStorageName(file.name);
    const base = sanitizeDownloadFileName(leadDisplayNameForFile(lead)) || "lead";
    const filename = ext ? `${base}${ext}` : base;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    message.error("Failed to download LHO file");
  } finally {
    hide();
  }
}

function str(val: unknown): string {
  return val != null ? String(val).trim() : "";
}

function LeadLhoDownloadButton({
  lead,
  apiPrefix,
}: {
  lead: Lead;
  apiPrefix: string;
}) {
  const [loading, setLoading] = React.useState(false);
  const { roles, profile } = useAuth();
  return (
    <Button
      type="text"
      size="small"
      icon={<DownloadOutlined />}
      loading={loading}
      title="Download LHO file"
      aria-label="Download LHO file"
      onClick={async () => {
        setLoading(true);
        try {
          const shouldUseClientLogo = shouldGenerateLhoPdfWithLogo(
            roles.map((r) => r.role_name)
          );
          const clientLogoUrl =
            (profile as { client_logo_url?: string | null } | null)?.client_logo_url ?? null;

          // client_viewer / DC: fresh LHO PDF with client logo (not stale storage uploads).
          if (shouldUseClientLogo) {
            const res = await fetch(`${apiPrefix}/${lead.id}`, { credentials: "include" });
            const json = (await res.json().catch(() => ({}))) as {
              error?: string;
              lead?: Record<string, unknown>;
            };
            if (!res.ok || !json.lead) {
              message.error(json.error ?? "Failed to load lead details for LHO");
              return;
            }
            const lhoData = buildLhoDataFromLead(json.lead, {
              campaignQuestions: resolveCampaignQuestionsFromLeadRaw(json.lead),
            });
            await generateLhoPdf(lhoData, {
              logoSrc: clientLogoUrl,
              showClientName: true,
            });
            message.success("LHO PDF downloaded successfully");
            return;
          }

          await downloadLeadLhoFile(lead, apiPrefix);
        } finally {
          setLoading(false);
        }
      }}
    />
  );
}

/** Keeps column titles on one line (use with `table-single-line` on Table). */
export function applyLeadTableHeaderCells<T extends object>(columns: ColumnsType<T>): ColumnsType<T> {
  return columns.map((col) => {
    if (!col || typeof col !== "object") return col;
    const typed = col as ColumnType<T>;
    const width = typeof typed.width === "number" ? typed.width : undefined;
    const prevOnHeaderCell = typed.onHeaderCell;
    return {
      ...typed,
      onHeaderCell: (...args: Parameters<NonNullable<ColumnType<T>["onHeaderCell"]>>) => {
        const prev =
          typeof prevOnHeaderCell === "function"
            ? (prevOnHeaderCell(...args) as HTMLAttributes<HTMLTableCellElement>)
            : {};
        return {
          ...prev,
          style: {
            whiteSpace: "nowrap",
            ...(width != null ? { minWidth: width } : {}),
            ...prev.style,
          },
        };
      },
    };
  });
}

export function getLeadTableColumns(config: ColumnConfig = {}) {
  const {
    showActions = true,
    onEdit,
    showDeliveryStatus = false,
    showBillableStatus = false,
    onBillableStatusChange,
    allowClientRejectedDelivery = false,
    showQaStatus = true,
    showMeetingSetDate = true,
    showAppointment = true,
    showLhoFile = false,
    pinMeetingAndLhoColumns = true,
    lhoApiPrefix = "/api/command/leads",
    onMarkDelivered,
    markingDeliveredLeadId,
    onDeliveryStatusChange,
    pagination,
    showFollowupDate = true,
    showChannel = true,
    showAuditBy = false,
    showCreatedBy = true,
    showCreatedAt = true,
    showVoiceRecordings = false,
    onVoiceRecordingsChange,
  } = config;

  const page = pagination?.current ?? 1;
  const pageSize = pagination?.pageSize ?? 10;

  const baseColumns: NonNullable<TableProps<Lead>["columns"]> = [
    {
      title: "Sr. No.",
      key: "sr",
      width: 72,
      fixed: "left" as const,
      render: (_: unknown, __: Lead, index: number) =>
        tableSerialNumber(page, pageSize, index),
    },
    {
      title: "Lead ID",
      dataIndex: "lead_id",
      key: "lead_id",
      width: 160,
      fixed: "left" as const,
      render: (v: string | null) => {
        const id = v || "";
        if (!id) return "—";
        const copy = (e: React.MouseEvent) => {
          e.stopPropagation();
          navigator.clipboard.writeText(id).then(
            () => message.success("Lead ID copied"),
            () => message.error("Failed to copy")
          );
        };
        return (
          <span
            className="lead-id-cell"
            style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", minWidth: 0 }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
              }}
            >
              {id}
            </span>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined style={{ fontSize: 12 }} />}
              onClick={copy}
              className="lead-id-copy-btn"
              style={{ padding: "0 4px", minWidth: 24, height: 22, flexShrink: 0 }}
              title="Copy Lead ID"
            />
          </span>
        );
      },
    },
    {
      title: "Name",
      key: "name",
      width: 160,
      ellipsis: true,
      render: (_: unknown, r: Lead) =>
        [r.first_name, r.last_name].filter(Boolean).join(" ") || r.name || "—",
    },
    {
      title: "Company",
      dataIndex: "company_name",
      key: "company_name",
      width: 160,
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      width: 180,
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Phone",
      dataIndex: "phone",
      key: "phone",
      width: 120,
      render: (v: string | null) => (
        <span className="lead-phone-cell" data-no-dialer="true">{v || "—"}</span>
      ),
    },
    {
      title: "Job Title",
      dataIndex: "job_title",
      key: "job_title",
      width: 140,
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Industry",
      dataIndex: "industry",
      key: "industry",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    ...(showChannel
      ? [
          {
            title: "Channel",
            dataIndex: "channel",
            key: "channel",
            width: 190,
            ellipsis: true,
            render: (v: string | null | undefined) => v || "—",
          } as NonNullable<TableProps<Lead>["columns"]>[number],
        ]
      : []),
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (v: string) => (
        <Tag color={STATUS_COLORS[v] ?? "default"} style={{ textTransform: "capitalize" }}>
          {v?.replace("_", " ")}
        </Tag>
      ),
    },
    ...(showDeliveryStatus
      ? [
          {
            title: "Delivery",
            dataIndex: "delivery_status",
            key: "delivery_status",
            width: onDeliveryStatusChange ? 120 : 96,
            fixed: "right" as const,
            align: "center",
            onCell: () => ({ style: { paddingInline: 6 } }),
            ...(onDeliveryStatusChange
              ? {}
              : {
                  filters: [
                    { text: "Pending", value: "pending" },
                    { text: "Delivered", value: "delivered" },
                    { text: "Not Delivered", value: "not_delivered" },
                  ],
                  onFilter: (value: unknown, record: Lead) =>
                    (record.delivery_status ?? "pending") === String(value),
                }),
            render: (v: Lead["delivery_status"], record: Lead) => {
              const status = (v ?? "pending") as "pending" | "not_delivered" | "delivered" | "client_rejected";
              const delivered = status === "delivered";
              // Allow re-clicking if delivered but delivery metadata was never recorded (legacy)
              const canRedeliver =
                delivered && (!record.delivered_at || !record.delivered_by);
              const statusColor =
                status === "delivered"
                  ? "green"
                  : status === "not_delivered"
                  ? "default"
                  : status === "client_rejected"
                  ? "red"
                  : "orange";
              const statusText =
                status === "delivered"
                  ? "Delivered"
                  : status === "not_delivered"
                  ? "Not Delivered"
                  : status === "client_rejected"
                  ? "Client Rejected"
                  : "Pending";
              const wrapWithDeliveryTooltip = (content: React.ReactNode) => {
                if (!delivered) return content;
                return (
                  <Tooltip title={<DeliveryStatusTooltipContent record={record} />} placement="top">
                    <span
                      style={{ display: "inline-flex", justifyContent: "center", maxWidth: "100%" }}
                    >
                      {content}
                    </span>
                  </Tooltip>
                );
              };

              if (onDeliveryStatusChange) {
                return wrapWithDeliveryTooltip(
                  <span
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    style={{ display: "inline-flex", justifyContent: "center", maxWidth: "100%" }}
                  >
                    <Select
                      size="small"
                      value={status}
                      className={
                        status === "delivered"
                          ? "delivery-status-select delivery-status-select--delivered"
                          : "delivery-status-select"
                      }
                      style={{ width: 108, maxWidth: "100%" }}
                      loading={markingDeliveredLeadId === record.id}
                      options={[
                        { label: "Pending", value: "pending" },
                        { label: "Not Delivered", value: "not_delivered" },
                        { label: "Delivered", value: "delivered" },
                        ...(allowClientRejectedDelivery
                          ? [{ label: "Client Rejected", value: "client_rejected" }]
                          : []),
                      ]}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(nextStatus) => {
                        if (
                          nextStatus === status &&
                          !(status === "delivered" && canRedeliver)
                        ) {
                          return;
                        }
                        onDeliveryStatusChange(
                          record,
                          nextStatus as "pending" | "not_delivered" | "delivered" | "client_rejected"
                        );
                      }}
                    />
                  </span>
                );
              }

              return wrapWithDeliveryTooltip(
                <span
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    maxWidth: "100%",
                  }}
                >
                  <Tag color={statusColor} style={{ margin: 0 }}>
                    {statusText}
                  </Tag>
                  {(!delivered || canRedeliver) && onMarkDelivered ? (
                    <Button
                      type="link"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkDelivered(record);
                      }}
                      loading={markingDeliveredLeadId === record.id}
                      style={{ paddingInline: 0, height: "auto", fontSize: 11 }}
                    >
                      {canRedeliver ? "Set date" : "Deliver"}
                    </Button>
                  ) : null}
                </span>
              );
            },
          } as NonNullable<TableProps<Lead>["columns"]>[number],
        ]
      : []),
    ...(showBillableStatus
      ? [
          {
            title: "Billable Status",
            dataIndex: "billable_status",
            key: "billable_status",
            width: 190,
            fixed: "right" as const,
            align: "center",
            onCell: () => ({ style: { paddingInline: 6 } }),
            render: (v: string | null | undefined, record: Lead) =>
              onBillableStatusChange ? (
                <span
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{ display: "inline-flex", justifyContent: "center", maxWidth: "100%" }}
                >
                  <Select
                    size="small"
                    value={v ?? undefined}
                    placeholder="Select status"
                    style={{ width: 172, maxWidth: "100%" }}
                    options={BILLABLE_STATUS_OPTIONS}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(nextStatus) => onBillableStatusChange(record, nextStatus ?? null)}
                    allowClear
                  />
                </span>
              ) : (
                v || "—"
              ),
          } as NonNullable<TableProps<Lead>["columns"]>[number],
        ]
      : []),
    ...(showMeetingSetDate
      ? [
          {
            title: LEAD_MEETING_SET_DATE_TIME_LABEL,
            dataIndex: "scored",
            key: "scored",
            width: 200,
            ...(pinMeetingAndLhoColumns ? { fixed: "right" as const } : {}),
            sorter: true,
            render: (v: string | null | undefined) => {
              const text = formatLeadDateTimeCell(v);
              return (
                <span className="table-text-ellipsis" style={{ whiteSpace: "nowrap" }} title={text}>
                  {text}
                </span>
              );
            },
          } as NonNullable<TableProps<Lead>["columns"]>[number],
        ]
      : []),
    ...(showQaStatus
      ? [
          {
            title: "QA Status",
            dataIndex: "qa_status",
            key: "qa_status",
            width: 110,
            fixed: "right" as const,
            filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
              <div style={{ padding: 8 }}>
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="Filter QA status"
                  style={{ width: 180, marginBottom: 8, display: "block" }}
                  value={(selectedKeys as string[]) ?? []}
                  options={[
                    { value: "qualified", label: "Qualified" },
                    { value: "disqualified", label: "Disqualified" },
                    { value: "rectified", label: "Rectified" },
                  ]}
                  onChange={(values) => {
                    if (values && values.length > 0) {
                      setSelectedKeys(values);
                    } else {
                      setSelectedKeys([]);
                    }
                    confirm({ closeDropdown: false });
                  }}
                />
                {clearFilters && (
                  <Button
                    onClick={() => {
                      clearFilters();
                      confirm({ closeDropdown: false });
                    }}
                    size="small"
                    style={{ width: "100%" }}
                  >
                    Reset
                  </Button>
                )}
              </div>
            ),
            onFilter: (value, record) =>
              (record.qa_status ?? "").toLowerCase() === String(value).toLowerCase(),
            render: (v: string | null | undefined) =>
              v ? (
                <Tag
                  color={
                    v === "qualified" ? "green" : v === "disqualified" ? "red" : "blue"
                  }
                >
                  {v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()}
                </Tag>
              ) : (
                "—"
              ),
          } as NonNullable<TableProps<Lead>["columns"]>[number],
        ]
      : showAppointment
        ? [
            {
              title: LEAD_MEETING_DATE_TIME_LABEL,
              dataIndex: "appointment",
              key: "appointment",
              width: 172,
              ...(pinMeetingAndLhoColumns ? { fixed: "right" as const } : {}),
              sorter: true,
              render: (v: string | null | undefined) => {
                const text = formatLeadDateTimeCell(v);
                return (
                  <span className="table-text-ellipsis" style={{ whiteSpace: "nowrap" }} title={text}>
                    {text}
                  </span>
                );
              },
            } as NonNullable<TableProps<Lead>["columns"]>[number],
          ]
        : []),
    ...(showLhoFile
      ? [
          {
            title: "LHO file",
            key: "lho_file",
            width: 88,
            ...(pinMeetingAndLhoColumns ? { fixed: "right" as const } : {}),
            align: "center" as const,
            render: (_: unknown, record: Lead) => (
              <LeadLhoDownloadButton lead={record} apiPrefix={lhoApiPrefix} />
            ),
          } as NonNullable<TableProps<Lead>["columns"]>[number],
        ]
      : []),
    ...(showFollowupDate
      ? [
          {
            title: "Follow-up",
            dataIndex: "followup_date",
            key: "followup_date",
            width: 110,
            render: (v: string | null) =>
              v ? new Date(v).toLocaleDateString() : "—",
          } as NonNullable<TableProps<Lead>["columns"]>[number],
        ]
      : []),
    ...(showAuditBy
      ? [
          {
            title: "Audit by",
            key: "audit_by",
            width: 140,
            ellipsis: true,
            render: (_: unknown, record: Lead) =>
              record.audit_by_name?.trim() || record.qa_name?.trim() || "—",
          } as NonNullable<TableProps<Lead>["columns"]>[number],
        ]
      : []),
    ...(showCreatedBy
      ? [
          {
            title: "Created By",
            key: "created_by_name",
            width: 140,
            ellipsis: true,
            render: (_: unknown, record: Lead) => {
              const creatorSnapshot = (
                record as Lead & { creator_display_name?: string | null }
              ).creator_display_name?.trim();
              const agentName =
                record.assigned_agent_name?.trim() ||
                creatorSnapshot ||
                record.created_by_name?.trim();
              return showAuditBy ? agentName || "—" : record.created_by_name?.trim() || "—";
            },
          } as NonNullable<TableProps<Lead>["columns"]>[number],
        ]
      : []),
    ...(showCreatedAt
      ? [
          {
            title: "Created",
            dataIndex: "created_at",
            key: "created_at",
            width: 140,
            filters: [
              { text: "Today", value: "today" },
              { text: "Last 7 days", value: "last7" },
              { text: "Last 30 days", value: "last30" },
              { text: "This month", value: "month" },
              { text: "This quarter", value: "quarter" },
            ],
            onFilter: (value, record) => {
              const created = record.created_at ? dayjs(record.created_at) : null;
              if (!created) return false;
              const now = dayjs();
              switch (value) {
                case "today":
                  return created.isSame(now, "day");
                case "last7":
                  return created.isAfter(now.subtract(7, "day"));
                case "last30":
                  return created.isAfter(now.subtract(30, "day"));
                case "month":
                  return created.isSame(now, "month");
                case "quarter":
                  return (
                    created.year() === now.year() &&
                    Math.floor(created.month() / 3) === Math.floor(now.month() / 3)
                  );
                default:
                  return true;
              }
            },
            render: (v: string) =>
              v
                ? new Date(v).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "—",
          } as NonNullable<TableProps<Lead>["columns"]>[number],
        ]
      : []),
  ];

  const voiceRecordingColumn: NonNullable<TableProps<Lead>["columns"]>[number] = {
    title: "Rec.",
    key: "voice_recording",
    width: 80,
    align: "center",
    fixed: "left",
    onCell: () => ({ style: { paddingInline: 6 } }),
    render: (_: unknown, record: Lead) => (
      <LeadTableRecordingCell
        leadId={record.id}
        leadEmail={record.email}
        initialRecordings={record.voice_recordings}
        onRecordingsChange={onVoiceRecordingsChange}
      />
    ),
  };

  const extendedColumns = [
    ...baseColumns.slice(0, 2),
    ...(showVoiceRecordings ? [voiceRecordingColumn] : []),
    ...baseColumns.slice(2, 4),
    {
      title: "Direct Number",
      dataIndex: "direct_number",
      key: "direct_number",
      width: 128,
      render: (v: string | null) => (
        <span className="lead-phone-cell" data-no-dialer="true">{v || "—"}</span>
      ),
    },
    ...baseColumns.slice(4, 6),
    {
      title: "Corporate Number",
      dataIndex: "company_number",
      key: "company_number",
      width: 148,
      render: (v: string | null) => (
        <span className="lead-phone-cell" data-no-dialer="true">{v || "—"}</span>
      ),
    },
    ...baseColumns.slice(6, 8),
    {
      title: "Employee Size",
      dataIndex: "employee_size",
      key: "employee_size",
      width: 150,
      ellipsis: true,
      render: (v: string | null) => (
        <span className="table-text-ellipsis" title={v || "—"}>
          {v || "—"}
        </span>
      ),
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
      width: 240,
      ellipsis: true,
      render: (v: string | null) => (
        <span className="table-text-ellipsis" title={v || "—"}>
          {v || "—"}
        </span>
      ),
    },
    {
      title: "City",
      dataIndex: "city",
      key: "city",
      width: 100,
      ellipsis: true,
      render: (v: string | null) => (
        <span className="table-text-ellipsis" title={v || "—"}>
          {v || "—"}
        </span>
      ),
    },
    {
      title: "State",
      dataIndex: "state",
      key: "state",
      width: 100,
      ellipsis: true,
      render: (v: string | null) => (
        <span className="table-text-ellipsis" title={v || "—"}>
          {v || "—"}
        </span>
      ),
    },
    {
      title: "Country",
      dataIndex: "country",
      key: "country",
      width: 100,
      ellipsis: true,
      render: (v: string | null) => (
        <span className="table-text-ellipsis" title={v || "—"}>
          {v || "—"}
        </span>
      ),
    },
    {
      title: "Zip",
      dataIndex: "zip_code",
      key: "zip_code",
      width: 90,
      ellipsis: true,
      render: (v: string | null) => (
        <span className="table-text-ellipsis" title={v || "—"}>
          {v || "—"}
        </span>
      ),
    },
    ...baseColumns.slice(8),
  ];

  if (showActions && onEdit) {
    extendedColumns.push({
      title: "",
      key: "actions",
      width: 60,
      fixed: "right" as const,
      render: (_: unknown, record: Lead) => (
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(record);
          }}
        />
      ),
    } as never);
  }

  return applyLeadTableHeaderCells(extendedColumns);
}
