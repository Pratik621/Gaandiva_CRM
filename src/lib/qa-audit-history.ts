import type { SupabaseClient } from "@supabase/supabase-js";
import { appendLeadHistory } from "@/lib/command/rules-engine";
import {
  mergeQaAuditHistoryAfterUpdate,
  snapshotQaAuditForHistory,
  type ExistingLeadQaSnapshot,
} from "@/lib/qa-audit-attribution";

/** Append immutable lead_history row when QA audit fields change. */
export async function appendQaAuditLeadHistory(
  supabase: SupabaseClient,
  leadId: string,
  changedBy: string,
  existing: ExistingLeadQaSnapshot,
  updates: Record<string, unknown>,
  stamped: boolean,
  auditorUserId: string,
  auditorLabel: string
): Promise<void> {
  const before = snapshotQaAuditForHistory(existing);
  const after = mergeQaAuditHistoryAfterUpdate(
    before,
    updates,
    stamped,
    auditorUserId,
    auditorLabel
  );

  await appendLeadHistory(supabase, {
    leadId,
    changedBy,
    changeType: "qa_audit",
    oldValue: before as unknown as Record<string, unknown>,
    newValue: after as unknown as Record<string, unknown>,
    triggerSource: "manual",
    reasonCode: "qa_audit",
    metadata: {
      qa_audited_by_id: after.qa_audited_by_id,
      qa_audited_at: after.qa_audited_at,
      qa_name: after.qa_name,
    },
  });
}
