import dayjs from "dayjs";
import * as XLSX from "xlsx";
import type { Lead } from "@/types/lead.types";
import { isHiddenFromAgentExport } from "@/lib/agent-lead-fields";
import {
  LEAD_IMPORT_DATE_FIELDS,
  LEAD_IMPORT_TIMESTAMP_FIELDS,
} from "@/lib/lead-import-sanitize";
import {
  LEAD_DATETIME_EXPORT_HEADERS,
  LEAD_FIELD_EXPORT_HEADERS,
} from "@/lib/lead-field-labels";

/** System timestamps included in export but not re-imported. */
const EXPORT_READONLY_TIMESTAMP_FIELDS = new Set([
  "created_at",
  "updated_at",
  "qa_audited_at",
]);

const EXPORT_TIMESTAMP_FIELDS = new Set([
  ...LEAD_IMPORT_TIMESTAMP_FIELDS,
  ...EXPORT_READONLY_TIMESTAMP_FIELDS,
]);

type CampaignExportRow = {
  id: string;
  campaign_code?: string | null;
  lead_aggregated?: string | null;
  name: string;
  geography?: string | null;
  lead_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  total_allocation?: number | null;
  achieved?: number | null;
  client_rejected_leads_count?: number;
  pending_allocation?: number | null;
  scored_leads_count?: number;
  qualified_leads_count?: number;
  rectified_leads_count?: number;
  disqualified_leads_count?: number;
  qa_pending_leads_count?: number;
  delivered_leads_count?: number;
};


function formatExportTimestamp(value: unknown): string | null {
  const s = value == null ? "" : String(value).trim();
  if (!s) return null;
  const d = dayjs(s);
  if (!d.isValid()) return s;
  return d.format("MMM D, YYYY, h:mm A");
}

function formatExportDate(value: unknown): string | null {
  const s = value == null ? "" : String(value).trim();
  if (!s) return null;
  const d = dayjs(s);
  if (!d.isValid()) return s;
  return d.format("DD/MM/YYYY");
}

/**
 * Client export template: header = CSV/Excel column name; key = Lead / enrich property.
 * DB uuid `id` is omitted; re-upload matches via `lead_id`.
 */
const CSV_COLUMNS: { key: keyof Lead | string; header: string }[] = [
  { key: "campaign_id", header: "campaign_id" },
  { key: "campaign_name", header: "campaign_name" },
  { key: "lead_type", header: "Lead Type" },
  { key: "lead_id", header: "lead_id" },
  { key: "created_by_name", header: "Agent_Name" },
  { key: "team_leader_name", header: "Team_Leader_Name" },
  { key: "salutation", header: "salutation" },
  { key: "first_name", header: "first_name" },
  { key: "last_name", header: "last_name" },
  { key: "job_title", header: "job_title" },
  { key: "job_level", header: "job_level" },
  { key: "department", header: "department" },
  { key: "job_title_link", header: "job_title_link" },
  { key: "tenurity", header: "tenurity" },
  { key: "vv_status", header: "vv_status" },
  { key: "email", header: "email_Id" },
  { key: "domain", header: "domain" },
  { key: "direct_number", header: "direct_number" },
  { key: "company_number", header: "company_number" },
  { key: "company_name", header: "company_name" },
  { key: "company_website_link", header: "company_website_link" },
  { key: "address", header: "Address Line 1" },
  { key: "address2", header: "Address Line 2" },
  { key: "city", header: "city" },
  { key: "state", header: "state" },
  { key: "zip_code", header: "zip_code" },
  { key: "country", header: "country" },
  { key: "address_link", header: "Address Link" },
  { key: "employee_size", header: "employee_size" },
  { key: "actual_employee_size", header: "Actual_employee_size" },
  { key: "employee_size_link", header: "employee_size_link" },
  { key: "industry", header: "industry_Type" },
  { key: "industry_type_link", header: "industry_Type_Link" },
  { key: "revenue_range", header: "revenue_range" },
  { key: "revenue_link", header: "revenue_link" },
  { key: "sic_code", header: "sic_code" },
  { key: "sic_code_link", header: "sic_code_link" },
  { key: "naics_code", header: "naics_code" },
  { key: "naics_code_link", header: "naics_code_link" },
  { key: "scored", header: LEAD_DATETIME_EXPORT_HEADERS.scored },
  { key: "scored_timezone", header: LEAD_DATETIME_EXPORT_HEADERS.scored_timezone },
  { key: "appointment", header: LEAD_DATETIME_EXPORT_HEADERS.appointment },
  {
    key: "appointment_timezone",
    header: LEAD_DATETIME_EXPORT_HEADERS.appointment_timezone,
  },
  { key: "lead_tagging", header: "Lead Tagging" },
  { key: "lead_disposition", header: "Call_Disposition" },
  { key: "special_comments", header: LEAD_FIELD_EXPORT_HEADERS.special_comments },
  { key: "call_back", header: "call_back" },
  { key: "call_notes", header: "call_notes" },
  { key: "asset_title", header: "asset_title1" },
  { key: "asset_title2", header: "asset_title2" },
  { key: "email_status", header: "email_status" },
  { key: "ev_tool", header: "ev_tool" },
  { key: "cq1", header: "cq1" },
  { key: "cq2", header: "cq2" },
  { key: "cq3", header: "cq3" },
  { key: "cq4", header: "cq4" },
  { key: "cq5", header: "cq5" },
  { key: "extra_cq", header: "extra_cq" },
  { key: "qa_status", header: "qa_status" },
  { key: "primary_reason", header: "primary_reason" },
  { key: "secondary_reason", header: "secondary_reason" },
  { key: "qa_comments", header: "qa_comments" },
  { key: "qa_name", header: "qa_auditor" },
  { key: "qa_audited_at", header: "qa_audit_date" },
  { key: "rectification_status", header: "Rectification_status" },
  { key: "rectification_qa_name", header: "Rectification_qa_Name" },
  { key: "rectification_date", header: "Rectification_Date" },
  { key: "delivery_status", header: "delivery_status" },
  { key: "delivery_remark", header: "delivery_Remark" },
  { key: "delivered_by_name", header: "Delivery_Agent_Name" },
  { key: "delivered_at", header: "Deliver_Date" },
  { key: "created_at", header: "Lead Created Date & Time" },
];

function serializeExportCell(
  key: string,
  record: Record<string, unknown>
): string | number {
  const v = record[key];
  if (v == null) {
    if (key === "delivery_status") return "not_delivered";
    return "";
  }
  if (EXPORT_TIMESTAMP_FIELDS.has(key)) {
    return formatExportTimestamp(v) ?? "";
  }
  if (LEAD_IMPORT_DATE_FIELDS.has(key)) {
    return formatExportDate(v) ?? "";
  }
  if (typeof v === "object") return JSON.stringify(v);
  return v as string | number;
}

const AGENT_EXPORT_COLUMNS = CSV_COLUMNS.filter(
  (c) => !isHiddenFromAgentExport(String(c.key))
);

function escapeCsvValue(val: string | number | null | undefined): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Adds campaign_name, lead_type, and team leader name for export. */
export function enrichLeadsForExport(
  leads: Lead[],
  campaignName?: string | null,
  campaignLeadType?: string | null,
  teamLeaderName?: string | null
): Lead[] {
  const nameFallback = campaignName?.trim() ?? "";
  const leadTypeFallback = campaignLeadType?.trim() ?? "";
  const tlFallback = teamLeaderName?.trim() ?? "";
  return leads.map((lead) => {
    const record = lead as Record<string, unknown>;
    const existingName = (record.campaign_name as string | null | undefined)?.trim();
    const existingLeadType =
      (record.lead_type as string | null | undefined)?.trim() ||
      (record.campaign_lead_type as string | null | undefined)?.trim();
    const existingTl = (record.team_leader_name as string | null | undefined)?.trim();
    return {
      ...lead,
      campaign_name: existingName || nameFallback,
      lead_type: existingLeadType || leadTypeFallback,
      team_leader_name: existingTl || tlFallback || null,
    } as Lead;
  });
}

export function leadsToCsv(
  leads: Lead[],
  campaignName?: string | null,
  campaignLeadType?: string | null,
  options?: { excludeKeys?: readonly string[]; teamLeaderName?: string | null }
): string {
  const prepared = enrichLeadsForExport(
    leads,
    campaignName,
    campaignLeadType,
    options?.teamLeaderName
  );
  const exclude = new Set(options?.excludeKeys ?? []);
  const columns = exclude.size
    ? CSV_COLUMNS.filter((c) => !exclude.has(String(c.key)))
    : CSV_COLUMNS;
  const headers = columns.map((c) => c.header).join(",");
  const rows = prepared.map((lead) => {
    const record = lead as Record<string, unknown>;
    return columns
      .map((c) => escapeCsvValue(serializeExportCell(String(c.key), record)))
      .join(",");
  });
  return [headers, ...rows].join("\n");
}

export function downloadCsv(
  leads: Lead[],
  filename?: string,
  campaignName?: string | null,
  campaignLeadType?: string | null,
  teamLeaderName?: string | null
): void {
  const csv = leadsToCsv(leads, campaignName, campaignLeadType, {
    teamLeaderName,
  });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ?? `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Build array of arrays for Excel: first row = headers, then one row per lead.
 * Same columns as CSV so re-upload matches by id and updates correctly.
 */
function leadsToSheetData(
  leads: Lead[],
  campaignName?: string | null,
  campaignLeadType?: string | null,
  teamLeaderName?: string | null
): unknown[][] {
  const prepared = enrichLeadsForExport(
    leads,
    campaignName,
    campaignLeadType,
    teamLeaderName
  );
  const headers = CSV_COLUMNS.map((c) => c.header);
  const rows = prepared.map((lead) => {
    const record = lead as Record<string, unknown>;
    return CSV_COLUMNS.map((c) => serializeExportCell(String(c.key), record));
  });
  return [headers, ...rows];
}

/**
 * Download leads as an Excel file (.xlsx). Same columns as CSV; re-upload
 * matches existing leads by lead_id.
 */
export function downloadExcel(
  leads: Lead[],
  filename?: string,
  campaignName?: string | null,
  campaignLeadType?: string | null,
  teamLeaderName?: string | null
): void {
  const data = leadsToSheetData(
    leads,
    campaignName,
    campaignLeadType,
    teamLeaderName
  );
  const ws = XLSX.utils.aoa_to_sheet(data);
  const colWidths = CSV_COLUMNS.map((_, i) => {
    const maxLen = Math.max(
      ...data.map((row) => String(row[i] ?? "").length),
      (CSV_COLUMNS[i]?.header ?? "").length,
      10
    );
    return { wch: Math.min(maxLen, 50) };
  });
  ws["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ?? `leads-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function leadsToAgentExportRows(
  leads: Lead[],
  campaignName?: string | null,
  campaignLeadType?: string | null,
  teamLeaderName?: string | null
): string[][] {
  const prepared = enrichLeadsForExport(
    leads,
    campaignName,
    campaignLeadType,
    teamLeaderName
  );
  return prepared.map((lead) => {
    const record = lead as Record<string, unknown>;
    return AGENT_EXPORT_COLUMNS.map((c) => {
      const cell = serializeExportCell(String(c.key), record);
      return cell === "" ? "" : String(cell);
    });
  });
}

export function leadsToAgentCsv(
  leads: Lead[],
  campaignName?: string | null,
  campaignLeadType?: string | null,
  teamLeaderName?: string | null
): string {
  const headers = AGENT_EXPORT_COLUMNS.map((c) => c.header).join(",");
  const rows = leadsToAgentExportRows(
    leads,
    campaignName,
    campaignLeadType,
    teamLeaderName
  ).map((row) => row.map((cell) => escapeCsvValue(cell)).join(","));
  return [headers, ...rows].join("\n");
}

function leadsToAgentSheetData(
  leads: Lead[],
  campaignName?: string | null,
  campaignLeadType?: string | null,
  teamLeaderName?: string | null
): unknown[][] {
  const headers = AGENT_EXPORT_COLUMNS.map((c) => c.header);
  const rows = leadsToAgentExportRows(
    leads,
    campaignName,
    campaignLeadType,
    teamLeaderName
  );
  return [headers, ...rows];
}

export function downloadAgentCsv(
  leads: Lead[],
  filename?: string,
  campaignName?: string | null,
  campaignLeadType?: string | null,
  teamLeaderName?: string | null
): void {
  const csv = leadsToAgentCsv(
    leads,
    campaignName,
    campaignLeadType,
    teamLeaderName
  );
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ?? `agent-leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download Agent-safe Excel: includes lead_id for re-import matching; hides
 * QA/system fields agents must not edit.
 */
export function downloadAgentExcel(
  leads: Lead[],
  filename?: string,
  campaignName?: string | null,
  campaignLeadType?: string | null,
  teamLeaderName?: string | null
): void {
  const data = leadsToAgentSheetData(
    leads,
    campaignName,
    campaignLeadType,
    teamLeaderName
  );
  const ws = XLSX.utils.aoa_to_sheet(data);
  const colWidths = AGENT_EXPORT_COLUMNS.map((_, i) => {
    const maxLen = Math.max(
      ...data.map((row) => String(row[i] ?? "").length),
      (AGENT_EXPORT_COLUMNS[i]?.header ?? "").length,
      10
    );
    return { wch: Math.min(maxLen, 50) };
  });
  ws["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ??
    `agent-leads-format-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
export function downloadCampaignRawExcel(
  campaigns: CampaignExportRow[],
  filename?: string
): void {
  const headers = [
    "Sr. No.",
    "Campaign Number",
    "Aggregator",
    "Campaign",
    "Region",
    "Lead Type",
    "Start Date",
    "End Date",
    "Status",
    "Total Allocation",
    "Achieved",
    "Client Rejected",
    "Pending Allocation",
    "Leads",
    "Qualified",
    "Rectified",
    "Disqualified",
    "QA Pending",
    "Delivered",
  ];
  const rows = campaigns.map((campaign, index) => [
    index + 1,
    campaign.campaign_code ?? "",
    campaign.lead_aggregated ?? "",
    campaign.name ?? "",
    campaign.geography ?? "",
    campaign.lead_type ?? "",
    campaign.start_date
      ? dayjs(campaign.start_date).format("DD/MM/YYYY")
      : "",
    campaign.end_date
      ? dayjs(campaign.end_date).format("DD/MM/YYYY")
      : "",
    campaign.status ?? "",
    campaign.total_allocation ?? 0,
    campaign.achieved ?? 0,
    campaign.client_rejected_leads_count ?? 0,
    campaign.pending_allocation ?? 0,
    campaign.scored_leads_count ?? 0,
    campaign.qualified_leads_count ?? 0,
    campaign.rectified_leads_count ?? 0,
    campaign.disqualified_leads_count ?? 0,
    campaign.qa_pending_leads_count ?? 0,
    campaign.delivered_leads_count ?? 0,
  ]);
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const colWidths = headers.map((header, index) => {
    const maxLength = Math.max(
      header.length,
      ...data.map((row) => String(row[index] ?? "").length),
      10
    );
    return {
      wch: Math.min(maxLength, 50),
    };
  });
  ws["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Campaigns");
  const output = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
  });
  const blob = new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    filename ??
    `campaigns-raw-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
