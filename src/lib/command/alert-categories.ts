/**
 * §5.5.1 Alert categories — display labels, spec severity tier, and example copy.
 * DB stores `severity` as low | medium | high | critical; UI maps to Critical / Warning / Info.
 */

export type AlertSeverityTier = "critical" | "warning" | "info";

export type ResolutionCategoryValue =
  | "false_positive"
  | "corrective_action"
  | "escalated"
  | "acknowledged_outcome";

export const RESOLUTION_CATEGORY_OPTIONS: { value: ResolutionCategoryValue; label: string }[] = [
  { value: "false_positive", label: "False Positive" },
  { value: "corrective_action", label: "Corrective Action Taken" },
  { value: "escalated", label: "Escalated" },
  { value: "acknowledged_outcome", label: "Acknowledged" },
];

export function isResolutionCategory(v: string): v is ResolutionCategoryValue {
  return RESOLUTION_CATEGORY_OPTIONS.some((o) => o.value === v);
}

/** Map DB severity to UI tier per §5.5 */
export function severityToTier(severity: string): AlertSeverityTier {
  const s = String(severity ?? "").toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high" || s === "medium") return "warning";
  return "info";
}

export function tierLabel(tier: AlertSeverityTier): string {
  if (tier === "critical") return "Critical";
  if (tier === "warning") return "Warning";
  return "Info";
}

export function tierTagColor(tier: AlertSeverityTier): string {
  if (tier === "critical") return "red";
  if (tier === "warning") return "orange";
  return "blue";
}

export interface AlertCategoryDef {
  /** Canonical `alert_type` stored in DB (snake_case). */
  typeKey: string;
  /** Alternative keys that map to the same category label. */
  aliases?: string[];
  label: string;
  tier: AlertSeverityTier;
  trigger: string;
  example: string;
}

export const ALERT_CATEGORY_DEFINITIONS: AlertCategoryDef[] = [
  {
    typeKey: "dq_override",
    label: "DQ Override",
    tier: "critical",
    trigger:
      "A lead with Status = DQ is changed to Qualified or Registered by any user (admin override).",
    example: "Admin overrode DQ for Lead #4521 at 14:32 UTC",
  },
  {
    typeKey: "no_consent_registration",
    aliases: ["consent_missing"],
    label: "No-Consent Registration",
    tier: "critical",
    trigger: "An attempt is made to register a lead with Consent_Status ≠ Verified.",
    example: "Registration blocked for Lead #3892 (no consent)",
  },
  {
    typeKey: "excessive_call_attempts",
    label: "Excessive Call Attempts",
    tier: "warning",
    trigger: "A single lead receives more than N call attempts (configurable, default 5).",
    example: "Lead #2103 has received 7 call attempts in 48 hours",
  },
  {
    typeKey: "qa_rate_anomaly",
    label: "QA Rate Anomaly",
    tier: "warning",
    trigger: "Campaign QA pass rate drops below configurable threshold (default 70%).",
    example: "Campaign XYZ QA rate dropped to 62% (threshold: 70%)",
  },
  {
    typeKey: "consent_dispute",
    label: "Consent Dispute",
    tier: "critical",
    trigger: "A lead or external party disputes the validity of captured consent.",
    example: "Consent disputed for Lead #5567 by external request",
  },
  {
    typeKey: "duplicate_lead",
    label: "Duplicate Lead",
    tier: "info",
    trigger: "A lead with matching email + company already exists in the same campaign.",
    example: "Potential duplicate: Lead #6001 matches Lead #4200",
  },
  {
    typeKey: "stale_lead",
    label: "Stale Lead",
    tier: "info",
    trigger: "A lead has been in QA Pending status for more than N hours (default 24).",
    example: "Lead #7892 has been pending QA for 36 hours",
  },
];

const typeToDef = new Map<string, AlertCategoryDef>();
for (const def of ALERT_CATEGORY_DEFINITIONS) {
  typeToDef.set(def.typeKey.toLowerCase(), def);
  for (const a of def.aliases ?? []) {
    typeToDef.set(a.toLowerCase(), def);
  }
}

export function getAlertCategoryLabel(alertType: string): string {
  const def = typeToDef.get(String(alertType ?? "").toLowerCase());
  return def?.label ?? alertType.replace(/_/g, " ");
}

export function getAlertCategoryDef(alertType: string): AlertCategoryDef | null {
  return typeToDef.get(String(alertType ?? "").toLowerCase()) ?? null;
}
