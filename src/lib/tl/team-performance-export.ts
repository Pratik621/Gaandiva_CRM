import * as XLSX from "xlsx";
import type { TeamPerformanceResponse } from "@/app/api/tl/team-performance/route";

export type TeamPerformanceExportMeta = {
  campaignLabel: string;
  agentLabel: string;
  exportedAt: string;
};

function sheetFromRows(rows: Record<string, unknown>[]): XLSX.WorkSheet {
  if (rows.length === 0) {
    return XLSX.utils.aoa_to_sheet([["No data"]]);
  }
  return XLSX.utils.json_to_sheet(rows);
}

function appendSheet(
  wb: XLSX.WorkBook,
  name: string,
  rows: Record<string, unknown>[]
): void {
  const safeName = name.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows), safeName);
}

export function downloadTeamPerformanceReport(
  data: TeamPerformanceResponse,
  meta: TeamPerformanceExportMeta
): void {
  const isOM = data.scope === "organization";
  const singleDay = data.date_range.single_day;
  const { summary: s } = data;

  const summaryRows: Record<string, unknown>[] = [
    { Field: "Exported At", Value: meta.exportedAt },
    { Field: "Scope", Value: isOM ? "Organization" : "Team" },
    {
      Field: "Date Range",
      Value: `${data.date_range.start} to ${data.date_range.end}${
        singleDay ? " (single day)" : ""
      }`,
    },
    { Field: "Campaign Filter", Value: meta.campaignLabel },
    { Field: "Agent Filter", Value: meta.agentLabel },
    { Field: "", Value: "" },
    { Field: "Total Leads (in range)", Value: s.total_leads },
    { Field: "Today Leads", Value: s.today_leads },
    { Field: "Week Leads", Value: s.week_leads },
    { Field: "Month Leads", Value: s.month_leads },
    { Field: "Active Campaigns", Value: s.active_campaigns },
    { Field: "Total Campaigns", Value: s.total_campaigns },
    { Field: "Avg Upload / Day", Value: s.avg_per_day },
    { Field: "Pending Allocation", Value: s.pending_allocation },
    { Field: "Completion %", Value: s.completion_pct },
    { Field: "Active Agents", Value: s.active_agent_count },
  ];

  if (isOM) {
    summaryRows.push({ Field: "Active Team Leaders", Value: s.active_tl_count });
  }
  if (s.top_performer) {
    summaryRows.push({
      Field: "Top Performer",
      Value: `${s.top_performer.name} (${s.top_performer.total})`,
    });
  }

  const agentRows = data.agents.map((a, i) => {
    const row: Record<string, unknown> = {
      Rank: i + 1,
      Agent: a.agent_name,
      "Agent Code": a.agent_code ?? "",
      "Total Leads": a.total_leads,
      Qualified: a.qualified_leads,
      "Avg / Day": a.avg_per_day,
      "Campaigns Worked": a.campaigns_worked,
      "Last Upload": a.last_upload_date ?? "",
    };
    if (isOM) row["Team Leader"] = a.tl_name ?? "";
    if (!singleDay) {
      row.Today = a.today_leads;
      row["This Week"] = a.week_leads;
      row["This Month"] = a.month_leads;
    }
    return row;
  });

  const campaignRows = data.campaigns.map((c) => ({
    Campaign: c.campaign_name,
    Code: c.campaign_code ?? "",
    Status: c.status,
    Allocation: c.total_allocation,
    Uploaded: c.total_uploaded,
    Qualified: c.qualified_leads,
    "Progress %": c.progress_pct,
    Agents: c.agents_count,
    "Start Date": c.start_date ?? "",
    "End Date": c.end_date ?? "",
  }));

  const trendRows = data.daily_trend.map((d) => ({
    Date: d.date,
    Uploads: d.leads,
  }));

  const wb = XLSX.utils.book_new();
  appendSheet(wb, "Summary", summaryRows);
  appendSheet(wb, "Daily Trend", trendRows);
  appendSheet(wb, "Agents", agentRows);
  appendSheet(wb, "Campaigns", campaignRows);

  if (isOM && data.tl_summaries.length > 0) {
    appendSheet(
      wb,
      "Team Leaders",
      data.tl_summaries.map((t, i) => {
        const row: Record<string, unknown> = {
          Rank: i + 1,
          "Team Leader": t.tl_name,
          Agents: t.agent_count,
          Campaigns: t.campaign_count,
          "Total Leads": t.total_leads,
        };
        if (!singleDay) {
          row.Today = t.today_leads;
          row["This Week"] = t.week_leads;
          row["This Month"] = t.month_leads;
        }
        return row;
      })
    );
  }

  if (isOM && data.qa_summaries.length > 0) {
    appendSheet(
      wb,
      "QA Summary",
      data.qa_summaries.map((q, i) => ({
        Rank: i + 1,
        QA: q.qa_name,
        "Total Audited": q.total_audited,
        "In App": q.app_audited,
        Imported: q.imported_audited,
        Qualified: q.qualified_leads,
        Disqualified: q.disqualified_leads,
        Rectified: q.rectified_leads,
        "With QA Comments": q.with_qa_comments,
        Today: q.today_audited,
        "This Week": q.week_audited,
        "This Month": q.month_audited,
      }))
    );
  }

  const stamp = data.date_range.start.replace(/-/g, "");
  const endStamp = data.date_range.end.replace(/-/g, "");
  const filename = `team-performance_${stamp}-${endStamp}.xlsx`;

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
