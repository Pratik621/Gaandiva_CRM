import * as XLSX from "xlsx";
import dayjs from "dayjs";
import type {
  AgentConsolidatedRow,
  AgentDailyRow,
  QaAuditorConsolidatedRow,
  QaAuditorDetailRow,
} from "@/lib/mis/ops-performance-report";

export type OpsReportTabKey =
  | "agent-daily"
  | "agent-consolidated"
  | "qa-detail"
  | "qa-consolidated";

const OUTCOME_HEADERS = [
  "Qualified",
  "Disqualified",
  "Rectified",
  "TBD",
  "Grand Total",
] as const;

function outcomeValues(row: {
  qualified: number;
  disqualified: number;
  rectified: number;
  tbd: number;
  grand_total: number;
}) {
  return [
    row.qualified,
    row.disqualified,
    row.rectified,
    row.tbd,
    row.grand_total,
  ];
}

function rowsToRecords(
  headers: string[],
  rows: unknown[][]
): Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
}

function agentDailyToRows(rows: AgentDailyRow[]): Record<string, unknown>[] {
  const headers = [
    "Date",
    "Agent Name",
    "Qualified",
    "Disqualified",
    "Rectified",
    "QA Pending",
    "Grand Total",
  ];
  return rowsToRecords(
    headers,
    rows.map((r) => [
      dayjs(r.date).format("DD MMM YYYY"),
      r.agent_name,
      r.qualified,
      r.disqualified,
      r.rectified,
      r.tbd,
      r.grand_total,
    ])
  );
}

function agentConsolidatedToRows(rows: AgentConsolidatedRow[]): Record<string, unknown>[] {
  const headers = ["Agent Name", ...OUTCOME_HEADERS, "Qual %"];
  return rowsToRecords(
    headers,
    rows.map((r) => [r.agent_name, ...outcomeValues(r), `${r.qual_pct}%`])
  );
}

function qaDetailToRows(rows: QaAuditorDetailRow[]): Record<string, unknown>[] {
  const headers = ["QA Auditor", "Campaign Name", ...OUTCOME_HEADERS];
  return rowsToRecords(
    headers,
    rows.map((r) => [r.qa_name, r.campaign_name, ...outcomeValues(r)])
  );
}

function qaConsolidatedToRows(rows: QaAuditorConsolidatedRow[]): Record<string, unknown>[] {
  const headers = ["QA Auditor", ...OUTCOME_HEADERS, "Qualified %"];
  return rowsToRecords(
    headers,
    rows.map((r) => [r.qa_name, ...outcomeValues(r), `${r.qual_pct}%`])
  );
}

export function getOpsReportTabExportMeta(tab: OpsReportTabKey) {
  const meta: Record<
    OpsReportTabKey,
    { sheetName: string; filenamePrefix: string; emptyMessage: string }
  > = {
    "agent-daily": {
      sheetName: "Agent Daily",
      filenamePrefix: "agent-daily-performance",
      emptyMessage: "No agent daily data to export",
    },
    "agent-consolidated": {
      sheetName: "Agent Consolidated",
      filenamePrefix: "agent-consolidated-performance",
      emptyMessage: "No agent consolidated data to export",
    },
    "qa-detail": {
      sheetName: "QA Auditor Detail",
      filenamePrefix: "qa-auditor-campaign-detail",
      emptyMessage: "No QA auditor detail data to export",
    },
    "qa-consolidated": {
      sheetName: "QA Auditor Consolidated",
      filenamePrefix: "qa-auditor-consolidated",
      emptyMessage: "No QA auditor consolidated data to export",
    },
  };
  return meta[tab];
}

export function buildOpsReportTabExportRows(
  tab: OpsReportTabKey,
  data: {
    agentDaily: AgentDailyRow[];
    agentConsolidated: AgentConsolidatedRow[];
    qaDetail: QaAuditorDetailRow[];
    qaConsolidated: QaAuditorConsolidatedRow[];
  }
): Record<string, unknown>[] {
  switch (tab) {
    case "agent-daily":
      return agentDailyToRows(data.agentDaily);
    case "agent-consolidated":
      return agentConsolidatedToRows(data.agentConsolidated);
    case "qa-detail":
      return qaDetailToRows(data.qaDetail);
    case "qa-consolidated":
      return qaConsolidatedToRows(data.qaConsolidated);
    default:
      return [];
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");
}

export function downloadOpsReportTab(
  tab: OpsReportTabKey,
  data: {
    agentDaily: AgentDailyRow[];
    agentConsolidated: AgentConsolidatedRow[];
    qaDetail: QaAuditorDetailRow[];
    qaConsolidated: QaAuditorConsolidatedRow[];
  },
  format: "csv" | "excel",
  dateRange?: { start: string; end: string }
): { ok: true } | { ok: false; message: string } {
  const rows = buildOpsReportTabExportRows(tab, data);
  if (rows.length === 0) {
    return { ok: false, message: getOpsReportTabExportMeta(tab).emptyMessage };
  }

  const { sheetName, filenamePrefix } = getOpsReportTabExportMeta(tab);
  const stamp = new Date().toISOString().slice(0, 10);
  const rangeSuffix =
    dateRange?.start && dateRange?.end
      ? `_${dateRange.start}_to_${dateRange.end}`
      : "";

  if (format === "excel") {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenamePrefix}${rangeSuffix}_${stamp}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  }

  const csv = toCsv(rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}${rangeSuffix}_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true };
}
