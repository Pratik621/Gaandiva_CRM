/**
 * Command Center QA tab (§5.6): metrics derived from immutable `lead_history` status_change rows.
 * A "QA completion" is a transition qa_pending → qualified | disqualified.
 */

import dayjs from "dayjs";

export interface QaHistoryRow {
  lead_id: string;
  old_value: { status?: string; consent_status?: string } | null;
  new_value: { status?: string; consent_status?: string } | null;
  created_at: string;
  changed_by: string | null;
  reason: string | null;
}

export interface QaLeadRow {
  id: string;
  created_at: string;
}

export interface QaUserRef {
  id: string;
  full_name: string | null;
  email: string | null;
}

export interface QaSummaryMetrics {
  totalReviewed: number;
  passCount: number;
  failCount: number;
  passRatePct: number | null;
  failRatePct: number | null;
  avgMsIngestToQaComplete: number | null;
  reauditLeadCount: number;
}

export interface QaDailyTrendPoint {
  date: string;
  volume: number;
  passCount: number;
  failCount: number;
  passRatePct: number | null;
  failRatePct: number | null;
}

export interface QaDqReasonRow {
  code: string;
  count: number;
}

export interface QaReauditLogRow {
  lead_id: string;
  original_result: "qualified" | "disqualified";
  reaudit_result: "qualified" | "disqualified";
  performed_by: string | null;
  performed_by_label: string | null;
  performed_at: string;
  reason: string | null;
}

function norm(s: string | undefined | null): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function statusFromJson(v: QaHistoryRow["old_value"]): string {
  return norm(v?.status);
}

function isQaCompletion(row: QaHistoryRow): boolean {
  return (
    statusFromJson(row.old_value) === "qa_pending" &&
    (statusFromJson(row.new_value) === "qualified" || statusFromJson(row.new_value) === "disqualified")
  );
}

function outcome(row: QaHistoryRow): "qualified" | "disqualified" | null {
  const n = statusFromJson(row.new_value);
  if (n === "qualified") return "qualified";
  if (n === "disqualified") return "disqualified";
  return null;
}

function eachDayInRange(start: string, end: string): string[] {
  const a = dayjs(start, "YYYY-MM-DD", true);
  const b = dayjs(end, "YYYY-MM-DD", true);
  if (!a.isValid() || !b.isValid() || a.isAfter(b, "day")) return [];
  const out: string[] = [];
  for (let d = a; !d.isAfter(b, "day"); d = d.add(1, "day")) {
    out.push(d.format("YYYY-MM-DD"));
  }
  return out;
}

function userLabel(users: Map<string, QaUserRef>, id: string | null): string | null {
  if (!id) return null;
  const u = users.get(id);
  if (!u) return null;
  return u.full_name?.trim() || u.email?.trim() || id.slice(0, 8);
}

export function computeQaAnalytics(input: {
  leads: QaLeadRow[];
  history: QaHistoryRow[];
  disqualifiedReasonsCsv: { lead_id: string; disqualification_reasons: string | null }[];
  rangeStart: string;
  rangeEnd: string;
  users: Map<string, QaUserRef>;
}): {
  summary: QaSummaryMetrics;
  trend: QaDailyTrendPoint[];
  dqReasons: QaDqReasonRow[];
  reauditLog: QaReauditLogRow[];
} {
  const leadCreated = new Map(input.leads.map((l) => [l.id, l.created_at]));

  const byLead = new Map<string, QaHistoryRow[]>();
  for (const row of input.history) {
    if (!isQaCompletion(row)) continue;
    const list = byLead.get(row.lead_id) ?? [];
    list.push(row);
    byLead.set(row.lead_id, list);
  }
  for (const [, list] of byLead) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  let passCount = 0;
  let failCount = 0;
  const ingestMs: number[] = [];
  let reauditLeadCount = 0;
  const reauditLog: QaReauditLogRow[] = [];

  for (const [leadId, exits] of byLead) {
    if (exits.length === 0) continue;
    const first = exits[0];
    const o = outcome(first);
    if (o === "qualified") passCount += 1;
    else if (o === "disqualified") failCount += 1;

    const created = leadCreated.get(leadId);
    if (created) {
      const ms = new Date(first.created_at).getTime() - new Date(created).getTime();
      if (ms >= 0 && Number.isFinite(ms)) ingestMs.push(ms);
    }

    if (exits.length >= 2) {
      reauditLeadCount += 1;
      for (let i = 1; i < exits.length; i++) {
        const prev = outcome(exits[i - 1]);
        const cur = outcome(exits[i]);
        if (!prev || !cur) continue;
        const uid = exits[i].changed_by;
        reauditLog.push({
          lead_id: leadId,
          original_result: prev,
          reaudit_result: cur,
          performed_by: uid,
          performed_by_label: userLabel(input.users, uid),
          performed_at: exits[i].created_at,
          reason: exits[i].reason,
        });
      }
    }
  }

  const totalReviewed = passCount + failCount;
  const summary: QaSummaryMetrics = {
    totalReviewed,
    passCount,
    failCount,
    passRatePct:
      totalReviewed > 0 ? Math.round((passCount / totalReviewed) * 1000) / 10 : null,
    failRatePct:
      totalReviewed > 0 ? Math.round((failCount / totalReviewed) * 1000) / 10 : null,
    avgMsIngestToQaComplete:
      ingestMs.length > 0 ? ingestMs.reduce((a, c) => a + c, 0) / ingestMs.length : null,
    reauditLeadCount,
  };

  const days = eachDayInRange(input.rangeStart, input.rangeEnd);
  const byDay = new Map<string, { pass: number; fail: number }>();
  for (const d of days) byDay.set(d, { pass: 0, fail: 0 });

  for (const row of input.history) {
    if (!isQaCompletion(row)) continue;
    const day = row.created_at.slice(0, 10);
    if (!byDay.has(day)) continue;
    const o = outcome(row);
    const bucket = byDay.get(day)!;
    if (o === "qualified") bucket.pass += 1;
    else if (o === "disqualified") bucket.fail += 1;
  }

  const trend: QaDailyTrendPoint[] = days.map((date) => {
    const { pass, fail } = byDay.get(date) ?? { pass: 0, fail: 0 };
    const volume = pass + fail;
    return {
      date,
      volume,
      passCount: pass,
      failCount: fail,
      passRatePct: volume > 0 ? Math.round((pass / volume) * 1000) / 10 : null,
      failRatePct: volume > 0 ? Math.round((fail / volume) * 1000) / 10 : null,
    };
  });

  const dqMap = new Map<string, number>();
  for (const row of input.disqualifiedReasonsCsv) {
    const raw = row.disqualification_reasons;
    if (!raw || !String(raw).trim()) {
      const k = "(none specified)";
      dqMap.set(k, (dqMap.get(k) ?? 0) + 1);
      continue;
    }
    const parts = String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      const k = "(none specified)";
      dqMap.set(k, (dqMap.get(k) ?? 0) + 1);
      continue;
    }
    for (const p of parts) {
      dqMap.set(p, (dqMap.get(p) ?? 0) + 1);
    }
  }

  const dqReasons: QaDqReasonRow[] = [...dqMap.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);

  reauditLog.sort((a, b) => b.performed_at.localeCompare(a.performed_at));

  return { summary, trend, dqReasons, reauditLog };
}
