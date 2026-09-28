export const BILLABLE_STATUS_VALUES = [
  "Attended",
  "Attended-Billable",
  "Attended-Non-Billable",
  "Attended-Dispute",
  "TO BE Rescheduled",
  "Decline",
  "Disqualified",
  "Client Reject",
  "Future confirmed",
] as const;

export type BillableStatus = (typeof BILLABLE_STATUS_VALUES)[number];

export const BILLABLE_STATUS_OPTIONS = BILLABLE_STATUS_VALUES.map((status) => ({
  label: status,
  value: status,
}));

const BILLABLE_STATUS_LOOKUP = new Map(
  BILLABLE_STATUS_VALUES.map((status) => [status.toLowerCase(), status])
);

/** Normalize API/UI input to a stored billable status or null. */
export function normalizeBillableStatus(value: unknown): BillableStatus | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return BILLABLE_STATUS_LOOKUP.get(raw.toLowerCase()) ?? null;
}

/** Leads marked Attended-Billable count toward billable KPIs. */
export function isBillableLeadStatus(value: unknown): boolean {
  return normalizeBillableStatus(value) === "Attended-Billable";
}

export function countBillableLeads<T extends { billable_status?: unknown }>(
  leads: T[]
): number {
  return leads.filter((lead) => isBillableLeadStatus(lead.billable_status)).length;
}
