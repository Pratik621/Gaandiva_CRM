function normQaStatus(qaStatus: string | null | undefined): string {
  return String(qaStatus ?? "").trim().toLowerCase();
}

/** Lead has been QA-reviewed (any non-empty qa_status). */
export function isLeadAudited(qaStatus: string | null | undefined): boolean {
  return normQaStatus(qaStatus).length > 0;
}

/** Lead uploaded but not yet QA-reviewed. */
export function isLeadPendingAudit(qaStatus: string | null | undefined): boolean {
  return !isLeadAudited(qaStatus);
}

/** QA passed / qualified outcomes. */
export function isLeadQualified(qaStatus: string | null | undefined): boolean {
  const s = normQaStatus(qaStatus);
  return s === "qualified" || s === "approved" || s === "pass";
}

/** QA failed / rejected outcomes (audited but not qualified). */
export function isLeadDisqualified(qaStatus: string | null | undefined): boolean {
  if (!isLeadAudited(qaStatus)) return false;
  return !isLeadQualified(qaStatus);
}

export function countAuditedLeads<T extends { qa_status?: string | null }>(leads: T[]): number {
  return leads.filter((l) => isLeadAudited(l.qa_status)).length;
}

export function countPendingAuditLeads<T extends { qa_status?: string | null }>(leads: T[]): number {
  return leads.filter((l) => isLeadPendingAudit(l.qa_status)).length;
}

export function countQualifiedLeads<T extends { qa_status?: string | null }>(leads: T[]): number {
  return leads.filter((l) => isLeadQualified(l.qa_status)).length;
}

export function countDisqualifiedLeads<T extends { qa_status?: string | null }>(leads: T[]): number {
  return leads.filter((l) => isLeadDisqualified(l.qa_status)).length;
}
