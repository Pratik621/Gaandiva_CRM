/** Normalize person names for matching qa_name to users.full_name / email */
export function normalizePersonName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export type QaUserRef = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export function buildQaNameToIdMap(
  qaUsers: QaUserRef[],
  label: (u: QaUserRef) => string
): Map<string, string> {
  const map = new Map<string, string>();
  for (const qa of qaUsers) {
    map.set(normalizePersonName(label(qa)), qa.id);
    if (qa.full_name?.trim()) map.set(normalizePersonName(qa.full_name), qa.id);
    if (qa.email?.trim()) map.set(normalizePersonName(qa.email), qa.id);
  }
  return map;
}

export function resolveQaUserId(
  qaAuditedById: string | null | undefined,
  qaName: string | null | undefined,
  qaIds: Set<string>,
  qaNameToId: Map<string, string>
): string | null {
  if (qaAuditedById && qaIds.has(qaAuditedById)) return qaAuditedById;
  const key = normalizePersonName(qaName ?? "");
  if (!key) return null;
  return qaNameToId.get(key) ?? null;
}

const QA_AUDIT_FIELD_KEYS = [
  "qa_status",
  "qa_comments",
  "audit_date",
  "disqualification_reasons",
  "disqualification_reason",
  "rectified_reason",
  "rectification_status",
  "rectification_qa_name",
  "rectification_date",
] as const;

export type QaAuditFieldKey = (typeof QA_AUDIT_FIELD_KEYS)[number];

export const QA_LEAD_IMPORT_FIELD_KEYS: readonly QaAuditFieldKey[] = QA_AUDIT_FIELD_KEYS;

export function updatesTouchQaAudit(updates: Record<string, unknown>): boolean {
  return QA_AUDIT_FIELD_KEYS.some((k) => updates[k] !== undefined);
}

function normField(v: unknown): string {
  return String(v ?? "").trim();
}

export type ExistingLeadQaSnapshot = {
  qa_status?: string | null;
  qa_comments?: string | null;
  audit_date?: string | null;
  disqualification_reasons?: string | null;
  disqualification_reason?: string | null;
  rectified_reason?: string | null;
  rectification_status?: string | null;
  rectification_qa_name?: string | null;
  rectification_date?: string | null;
  qa_audited_by_id?: string | null;
  qa_audited_at?: string | null;
  qa_name?: string | null;
};

/** Build update payload keys from import row (only fields present in the spreadsheet). */
export function buildQaUpdatesFromImportRow(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const key of QA_AUDIT_FIELD_KEYS) {
    if (!(key in fields)) continue;
    if (key === "qa_status") {
      updates.qa_status =
        fields.qa_status && typeof fields.qa_status === "string"
          ? fields.qa_status.trim().toLowerCase()
          : null;
      continue;
    }
    if (
      key === "disqualification_reasons" ||
      key === "disqualification_reason" ||
      key === "rectified_reason" ||
      key === "rectification_status" ||
      key === "rectification_qa_name"
    ) {
      updates[key] =
        fields[key] && typeof fields[key] === "string" ? String(fields[key]).trim() : null;
      continue;
    }
    updates[key] = fields[key] ?? null;
  }
  return updates;
}

/** True when a QA user save should record who performed the audit. */
export function shouldStampQaAuditor(
  existing: ExistingLeadQaSnapshot,
  updates: Record<string, unknown>
): boolean {
  if (!updatesTouchQaAudit(updates)) return false;

  const hadAuditor = Boolean(existing.qa_audited_by_id);
  const nextStatus = "qa_status" in updates ? normField(updates.qa_status) : normField(existing.qa_status);

  if (!hadAuditor && nextStatus) return true;

  if ("qa_status" in updates && normField(updates.qa_status) !== normField(existing.qa_status)) {
    return true;
  }
  if ("qa_comments" in updates && normField(updates.qa_comments) !== normField(existing.qa_comments)) {
    return true;
  }
  if ("audit_date" in updates && normField(updates.audit_date) !== normField(existing.audit_date)) {
    return true;
  }
  if (
    "disqualification_reasons" in updates &&
    normField(updates.disqualification_reasons) !== normField(existing.disqualification_reasons)
  ) {
    return true;
  }
  if (
    "disqualification_reason" in updates &&
    normField(updates.disqualification_reason) !== normField(existing.disqualification_reason)
  ) {
    return true;
  }
  if (
    "rectified_reason" in updates &&
    normField(updates.rectified_reason) !== normField(existing.rectified_reason)
  ) {
    return true;
  }
  if (
    "rectification_status" in updates &&
    normField(updates.rectification_status) !== normField(existing.rectification_status)
  ) {
    return true;
  }
  if (
    "rectification_qa_name" in updates &&
    normField(updates.rectification_qa_name) !== normField(existing.rectification_qa_name)
  ) {
    return true;
  }
  if (
    "rectification_date" in updates &&
    normField(updates.rectification_date) !== normField(existing.rectification_date)
  ) {
    return true;
  }

  return false;
}

export async function stampQaAuditorOnLeadUpdate(
  updates: Record<string, unknown>,
  auditorUserId: string,
  fetchProfile: () => Promise<{ full_name: string | null; email: string | null } | null>
): Promise<void> {
  updates.qa_audited_by_id = auditorUserId;
  updates.qa_audited_at = new Date().toISOString();
  const profile = await fetchProfile();
  updates.qa_name = profile?.full_name?.trim() || profile?.email?.trim() || null;
}

/** Lead has a QA outcome worth counting in performance summaries. */
export function leadHasQaOutcome(qaStatus: string | null | undefined): boolean {
  return normField(qaStatus).length > 0;
}

/** QA saved in the app (auditor stamped on the lead). */
export function isAppStampedQaAudit(
  qaAuditedById: string | null | undefined,
  qaUserIds: Set<string>
): boolean {
  return Boolean(qaAuditedById && qaUserIds.has(qaAuditedById));
}

export type QaAuditActivityLead = {
  qa_audited_at?: string | null;
  audit_date?: string | null;
  updated_at: string;
};

/** Calendar day for QA audit activity (app saves vs imported sheet). */
export function qaAuditActivityDay(
  lead: QaAuditActivityLead,
  isAppAudit: boolean,
  appTz: string,
  formatDay: (iso: string, tz: string) => string
): string {
  if (isAppAudit) {
    if (lead.qa_audited_at) return formatDay(lead.qa_audited_at, appTz);
    return formatDay(lead.updated_at, appTz);
  }
  const ad = lead.audit_date?.trim();
  if (ad) return ad.length >= 10 ? ad.slice(0, 10) : ad;
  if (lead.qa_audited_at) return formatDay(lead.qa_audited_at, appTz);
  return formatDay(lead.updated_at, appTz);
}

export function applyQaAuditorToImportPayload(
  payload: Record<string, unknown>,
  existing: ExistingLeadQaSnapshot,
  fields: Record<string, unknown>,
  auditorUserId: string,
  auditorLabel: string
): boolean {
  const qaUpdates = buildQaUpdatesFromImportRow(fields);
  if (!shouldStampQaAuditor(existing, qaUpdates)) return false;
  payload.qa_audited_by_id = auditorUserId;
  payload.qa_audited_at = new Date().toISOString();
  payload.qa_name = auditorLabel;
  return true;
}

/** True for dedicated QA / QA TL roles (not agent, MIS, TL, OM, or admin). */
export function isQaRoleForAuditImport(roleNames: string[]): boolean {
  return roleNames.includes("qa") || roleNames.includes("qa_tl");
}

export type QaAuditHistoryValue = {
  qa_status: string | null;
  qa_comments: string | null;
  qa_audited_by_id: string | null;
  qa_audited_at: string | null;
  qa_name: string | null;
};

export function snapshotQaAuditForHistory(
  row: ExistingLeadQaSnapshot
): QaAuditHistoryValue {
  return {
    qa_status: row.qa_status ?? null,
    qa_comments: row.qa_comments ?? null,
    qa_audited_by_id: row.qa_audited_by_id ?? null,
    qa_audited_at: row.qa_audited_at ?? null,
    qa_name: row.qa_name ?? null,
  };
}

export function mergeQaAuditHistoryAfterUpdate(
  before: QaAuditHistoryValue,
  updates: Record<string, unknown>,
  stamped: boolean,
  auditorUserId: string,
  auditorLabel: string
): QaAuditHistoryValue {
  const after: QaAuditHistoryValue = { ...before };
  if ("qa_status" in updates) {
    after.qa_status =
      updates.qa_status != null ? String(updates.qa_status) : null;
  }
  if ("qa_comments" in updates) {
    after.qa_comments =
      updates.qa_comments != null ? String(updates.qa_comments) : null;
  }
  if (stamped) {
    after.qa_audited_by_id = auditorUserId;
    after.qa_audited_at =
      typeof updates.qa_audited_at === "string"
        ? updates.qa_audited_at
        : new Date().toISOString();
    after.qa_name = auditorLabel;
  }
  return after;
}
