/**
 * Lead Status State Machine
 *
 * Strict allowed transitions:
 *   new          → qa_pending
 *   qa_pending   → qualified | disqualified
 *   qualified    → registered
 *   registered   → attended | no_show
 *
 * DQ override (admin-only) bypasses the state machine entirely.
 * All other transitions are blocked with an explicit error.
 */

export const LEAD_STATUSES = [
  "new",
  "qa_pending",
  "qualified",
  "disqualified",
  "registered",
  "attended",
  "no_show",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Edges: from → allowed targets */
export const VALID_TRANSITIONS: Readonly<Record<string, readonly LeadStatus[]>> = {
  new:        ["qa_pending"],
  qa_pending: ["qualified", "disqualified"],
  qualified:  ["registered"],
  registered: ["attended", "no_show"],
  // Terminal states — no forward transitions
  disqualified: [],
  attended:     [],
  no_show:      [],
} as const;

/** States that cannot be transitioned into via normal flow */
export const TERMINAL_STATES: ReadonlySet<string> = new Set([
  "attended",
  "no_show",
  "disqualified",
]);

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate a proposed status transition.
 * @param current - current lead status
 * @param next    - proposed new status
 * @returns `{ allowed: true }` or `{ allowed: false, reason: "..." }`
 */
export function validateTransition(
  current: string,
  next: string
): TransitionResult {
  if (current === next) {
    return { allowed: false, reason: `Lead is already in status '${current}'.` };
  }

  const allowed = VALID_TRANSITIONS[current];

  if (!allowed) {
    return {
      allowed: false,
      reason: `Unknown current status '${current}'. Cannot transition.`,
    };
  }

  if (allowed.length === 0) {
    return {
      allowed: false,
      reason: `Status '${current}' is terminal. No further transitions are permitted.`,
    };
  }

  if (!(allowed as readonly string[]).includes(next)) {
    return {
      allowed: false,
      reason:
        `Transition '${current}' → '${next}' is not allowed. ` +
        `Valid next states: [${allowed.join(", ")}].`,
    };
  }

  return { allowed: true };
}

/**
 * Returns the human-readable label for a status.
 */
export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    new:          "New",
    qa_pending:   "QA Pending",
    qualified:    "Qualified",
    disqualified: "Disqualified",
    registered:   "Registered",
    attended:     "Attended",
    no_show:      "No Show",
  };
  return labels[status] ?? status;
}

/**
 * Returns all valid next states from `current`, excluding terminal loops.
 * Useful for populating dropdowns in the UI.
 */
export function nextStates(current: string): LeadStatus[] {
  return [...(VALID_TRANSITIONS[current] ?? [])];
}
