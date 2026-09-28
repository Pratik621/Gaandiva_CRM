/**
 * Human-readable labels for lead_history rows (Leads table "Last action").
 */

export type HistoryRowMin = {
  change_type: string;
  new_value: Record<string, unknown> | null;
  old_value: Record<string, unknown> | null;
  reason: string | null;
  /** First-class status after change (when populated). */
  new_status?: string | null;
};

export function formatLeadHistoryAction(row: HistoryRowMin): string {
  const ct = String(row.change_type ?? "").toLowerCase();
  const reason = (row.reason ?? "").toLowerCase();

  if (reason.includes("dq override") || (reason.includes("override") && ct.includes("dq"))) {
    return "DQ Override";
  }

  if (ct === "status_change") {
    const nv = row.new_value as { status?: string } | null;
    const st = String(row.new_status ?? nv?.status ?? "").toLowerCase();
    const map: Record<string, string> = {
      qualified: "QA Passed",
      disqualified: "Disqualified",
      registered: "Registered",
      qa_pending: "QA Pending",
      new: "New",
      attended: "Attended",
      no_show: "No-Show",
    };
    if (map[st]) return map[st];
    if (st) return `Status → ${st.replace(/_/g, " ")}`;
  }

  if (ct === "qa_audit") return "QA audit updated";
  if (ct === "dq_override" || ct === "disqualification_override") return "DQ Override";
  if (ct.includes("consent")) return "Consent updated";
  if (ct.includes("risk")) return "Risk updated";

  return String(row.change_type ?? "Update").replace(/_/g, " ");
}
