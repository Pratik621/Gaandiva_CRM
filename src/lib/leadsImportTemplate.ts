import * as XLSX from "xlsx";

/**
 * Row 1 labels for campaign lead import templates.
 * Lowercased values must match keys in `leadsImport.ts` HEADER_MAP so the same file parses correctly on upload.
 */
export const CAMPAIGN_LEADS_IMPORT_TEMPLATE_HEADERS = [
  "Lead ID",
  "First Name",
  "Last Name",
  "Company Name",
  "Email",
  "Phone",
  "Job Title",
  "Industry",
  "City",
  "State",
  "Country",
  "Address",
  "Address 2",
  "Zip Code",
  "Domain",
  "Direct Number",
  "Company Number",
  "Department",
  "Job Function",
  "Job Level",
  "Lead Tagging",
  "Status",
  "QA Status",
  "Client LP Reg Timestamp",
  "Notes",
] as const;

/** Example row illustrating accepted values (delete row 2+ and replace with your leads). */
export const CAMPAIGN_LEADS_IMPORT_TEMPLATE_SAMPLE_ROW: string[] = [
  "CMP-CLIENT-CAMPAIGN-2026-0401-A1B2",
  "Jane",
  "Doe",
  "Acme Corporation",
  "jane.doe@example.com",
  "+1-555-0100",
  "Director of IT",
  "Technology",
  "San Francisco",
  "CA",
  "USA",
  "123 Market Street",
  "Suite 400",
  "94102",
  "example.com",
  "+1-555-0101",
  "+1-800-555-0199",
  "Engineering",
  "Sales",
  "Director",
  "Scored",
  "new",
  "",
  "2026-04-10T14:30:00Z",
  "Sample row — remove and add your data; keep row 1 headers unchanged.",
];

function escapeCsvCell(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCampaignLeadsImportTemplateCsv(): string {
  const headerLine = CAMPAIGN_LEADS_IMPORT_TEMPLATE_HEADERS.map(escapeCsvCell).join(",");
  const sampleLine = CAMPAIGN_LEADS_IMPORT_TEMPLATE_SAMPLE_ROW.map(escapeCsvCell).join(",");
  return `\uFEFF${headerLine}\n${sampleLine}\n`;
}

export function downloadCampaignLeadsImportTemplate(format: "csv" | "xlsx"): void {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const csv = buildCampaignLeadsImportTemplateCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lead-import-template-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const aoa: string[][] = [
    [...CAMPAIGN_LEADS_IMPORT_TEMPLATE_HEADERS],
    [...CAMPAIGN_LEADS_IMPORT_TEMPLATE_SAMPLE_ROW],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = CAMPAIGN_LEADS_IMPORT_TEMPLATE_HEADERS.map((h) => ({
    wch: Math.min(Math.max(h.length, 12), 42),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lead-import-template-${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
