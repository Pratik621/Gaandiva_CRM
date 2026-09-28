import * as XLSX from "xlsx";
import {
  coerceParsedImportCell,
  finalizeImportedLeadRow,
  isImportPlaceholder,
} from "@/lib/lead-import-sanitize";
import {
  LEAD_MEETING_NOTES_LABEL,
  resolveLeadDatetimeImportHeader,
} from "@/lib/lead-field-labels";

/**
 * Parse CSV file and return array of lead objects for bulk import.
 * Maps common column headers (case-insensitive) to lead fields.
 */

const HEADER_MAP: Record<string, string> = {
  "lead id": "lead_id",
  "first name": "first_name",
  "firstname": "first_name",
  "last name": "last_name",
  "lastname": "last_name",
  name: "name",
  company: "company_name",
  "company name": "company_name",
  "company_name": "company_name",
  email: "email",
  email_id: "email",
  "email id": "email",
  phone: "phone",
  "job title": "job_title",
  "jobtitle": "job_title",
  "job_title": "job_title",
  industry: "industry",
  industry_type: "industry",
  "industry type": "industry",
  channel: "channel",
  city: "city",
  state: "state",
  country: "country",
  address: "address",
  address1: "address",
  "address 1": "address",
  "address line 1": "address",
  "address line1": "address",
  address_line_1: "address",
  address2: "address2",
  "address 2": "address2",
  "address line 2": "address2",
  "address line2": "address2",
  address_line_2: "address2",
  address_link: "address_link",
  "address link": "address_link",
  addresslink: "address_link",
  actual_employee_size: "actual_employee_size",
  "actual employee size": "actual_employee_size",
  industry_type_link: "industry_type_link",
  "industry type link": "industry_type_link",
  "zip code": "zip_code",
  "zip_code": "zip_code",
  status: "status",
  "qa status": "qa_status",
  "qa_status": "qa_status",
  "qa comment": "qa_comments",
  "qa_comment": "qa_comments",
  "qa comments": "qa_comments",
  "qa_comments": "qa_comments",
  "qa auditor": "qa_name",
  "qa_auditor": "qa_name",
  "qa audit date": "qa_audited_at",
  "qa_audit_date": "qa_audited_at",
  "delivery status": "delivery_status",
  "delivery_status": "delivery_status",
  delivery_remark: "delivery_remark",
  "delivery remark": "delivery_remark",
  "delivered at": "delivered_at",
  "delivered_at": "delivered_at",
  deliver_date: "delivered_at",
  "deliver date": "delivered_at",
  delivery_date: "delivered_at",
  "delivery date": "delivered_at",
  delivery_agent_name: "delivered_by_name",
  "delivery agent name": "delivered_by_name",
  agent_name: "created_by_name",
  "agent name": "created_by_name",
  manager_name: "team_leader_name",
  "manager name": "team_leader_name",
  team_leader_name: "team_leader_name",
  "team leader name": "team_leader_name",
  call_disposition: "lead_disposition",
  "call disposition": "lead_disposition",
  asset_title1: "asset_title",
  "asset title1": "asset_title",
  "asset title 1": "asset_title",
  asset_title2: "asset_title2",
  "asset title2": "asset_title2",
  "asset title 2": "asset_title2",
  rectification_status: "rectification_status",
  "rectification status": "rectification_status",
  rectification_qa_name: "rectification_qa_name",
  "rectification qa name": "rectification_qa_name",
  rectification_date: "rectification_date",
  "rectification date": "rectification_date",
  "client lp reg timestamp": "registered_at",
  "client_lp_reg_timestamp": "registered_at",
  "registered at": "registered_at",
  registered_at: "registered_at",
  notes: "notes",
  domain: "domain",
  "direct number": "direct_number",
  "direct_number": "direct_number",
  "company number": "company_number",
  "company_number": "company_number",
  "phone number": "phone",
  "phone_number": "phone",
  department: "department",
  "job function": "job_function",
  "job level": "job_level",
  "lead type": "lead_type",
  "lead_type": "lead_type",
  "campaign_lead_type": "lead_type",
  "special comments": "special_comments",
  special_comments: "special_comments",
  [LEAD_MEETING_NOTES_LABEL.toLowerCase()]: "special_comments",
  "meeting notes": "special_comments",
  meeting_notes: "special_comments",
  // Lead Tagging — explicit aliases (also salvage "Scored" misplaced in date cols)
  "lead tagging": "lead_tagging",
  lead_tagging: "lead_tagging",
  leadtagging: "lead_tagging",
  tagging: "lead_tagging",
  "lead tag": "lead_tagging",
};

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function mapImportHeader(header: string): string {
  const lower = stripBom(header).toLowerCase().trim();
  const datetimeKey = resolveLeadDatetimeImportHeader(lower);
  if (datetimeKey) return datetimeKey;
  return HEADER_MAP[lower] ?? lower.replace(/\s+/g, "_");
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        current += c;
      }
    } else if (c === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseLeadsCsv(csvText: string): Record<string, unknown>[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(stripBom(lines[0])).map((h) => stripBom(h).trim());
  const colMap = headers.map((h) => mapImportHeader(h));

  const leads: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    for (let j = 0; j < colMap.length && j < values.length; j++) {
      const key = colMap[j];
      if (!key) continue;
      const coerced = coerceParsedImportCell(key, values[j]?.trim() ?? "");
      if (coerced !== undefined) {
        row[key] = coerced;
      }
    }
    if (Object.keys(row).length > 0) {
      if (!row.name && (row.first_name || row.last_name)) {
        row.name = [row.first_name, row.last_name].filter(Boolean).join(" ");
      }
      leads.push(finalizeImportedLeadRow(row));
    }
  }
  return leads;
}

/**
 * Parse Excel file (.xlsx) and return array of lead objects for bulk import.
 * Expects first row = headers (e.g. id, first_name, company_name, ...).
 * Preserves "id" so re-upload can match and update existing leads.
 */
export function parseLeadsExcel(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const ws = wb.Sheets[firstSheet];
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
  if (aoa.length < 2) return [];
  const headers = (aoa[0] ?? []).map((h) => stripBom(String(h ?? "")).trim());
  const colMap = headers.map((h) => mapImportHeader(h));
  const leads: Record<string, unknown>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const values = aoa[i] ?? [];
    const row: Record<string, unknown> = {};
    for (let j = 0; j < colMap.length; j++) {
      const key = colMap[j];
      if (!key) continue;
      const val = values[j];
      if (key === "id" || key === "lead_id") {
        const idStr = val != null ? String(val).trim() : "";
        if (idStr && !isImportPlaceholder(idStr)) row[key] = idStr;
        continue;
      }
      const coerced = coerceParsedImportCell(key, val);
      if (coerced !== undefined) row[key] = coerced;
    }
    if (row.id === "") delete row.id;
    if (Object.keys(row).length > 0) {
      if (!row.name && (row.first_name || row.last_name)) {
        row.name = [row.first_name, row.last_name].filter(Boolean).join(" ");
      }
      leads.push(finalizeImportedLeadRow(row));
    }
  }
  return leads;
}
