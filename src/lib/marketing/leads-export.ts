import * as XLSX from "xlsx";
import { getPropertyValue, getLocation, formatPhone, getLeadSourceInfo } from "./lead-fields";

export interface ExportableLead {
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  raw_data: Record<string, string> | null;
  call_form_response: { notes?: string } | null;
  callback_at: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
  created_at: string;
  source?: string | null;
  meta_form_name?: string | null;
  meta_campaign_name?: string | null;
  meta_ad_name?: string | null;
  campaignName?: string;
}

export function buildLeadsExportBuffer(leads: ExportableLead[], includeCampaignColumn: boolean): Buffer {
  const rows = leads.map((lead, index) => {
    const sourceInfo = getLeadSourceInfo(lead);
    return {
    "Sr No": index + 1,
    Name: lead.name || "",
    Phone: formatPhone(lead.phone) || lead.phone || "",
    Email: lead.email || "",
    Property: getPropertyValue(lead.raw_data) || "",
    Location: getLocation(lead.raw_data) || "",
    ...(includeCampaignColumn ? { Campaign: lead.campaignName || "" } : {}),
    Source: sourceInfo.sourceLabel,
    "Meta Form": sourceInfo.formName || "",
    "Meta Campaign": sourceInfo.campaignName || "",
    "Meta Ad": sourceInfo.adName || "",
    Status: lead.status.replace(/_/g, " ").toUpperCase(),
    Notes: lead.call_form_response?.notes || "",
    "Last Updated By": lead.updated_by_name || "",
    "Last Updated At": lead.updated_at ? new Date(lead.updated_at).toLocaleString() : "",
    "Callback At": lead.callback_at ? new Date(lead.callback_at).toLocaleString() : "",
    "Created At": lead.created_at ? new Date(lead.created_at).toLocaleString() : "",
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Leads");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
