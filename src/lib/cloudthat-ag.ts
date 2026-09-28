/** Campaign-scoped rules for CloudThat AG only (name match). */

export const CLOUDTHAT_AG_CAMPAIGN_NAME = "CloudThat AG";

/** Stored in leads.lead_tagging — these count as QA/MIS-visible (scored-equivalent). */
export const CLOUDTHAT_AG_LEAD_TAGGING = {
  AZURE:
    "CloudThat x Microsoft Enterprise Data & AI (Azure) Campaign",
  SCI:
    "CloudThat x Microsoft Enterprise Security, Compliance, and Identity (SCI) Campaign",
  GCP: "CloudThat x GCP New Pricing Model",
} as const;

export type CloudThatAgLeadTagging =
  (typeof CLOUDTHAT_AG_LEAD_TAGGING)[keyof typeof CLOUDTHAT_AG_LEAD_TAGGING];

export const CLOUDTHAT_AG_LEAD_TAGGING_VALUES: string[] = Object.values(
  CLOUDTHAT_AG_LEAD_TAGGING
);

/** Dropdown options shown only on CloudThat AG campaign lead forms. */
export const CLOUDTHAT_AG_LEAD_TAGGING_OPTIONS = [
  {
    value: CLOUDTHAT_AG_LEAD_TAGGING.AZURE,
    label: "CloudThat x Microsoft — Enterprise Data & AI (Azure) Campaign",
  },
  {
    value: CLOUDTHAT_AG_LEAD_TAGGING.SCI,
    label:
      "CloudThat x Microsoft — Enterprise Security, Compliance, and Identity (SCI) Campaign",
  },
  {
    value: CLOUDTHAT_AG_LEAD_TAGGING.GCP,
    label: CLOUDTHAT_AG_LEAD_TAGGING.GCP,
  },
];

export function isCloudThatAgCampaign(
  campaignName: string | null | undefined
): boolean {
  return (
    (campaignName ?? "").trim().toLowerCase() ===
    CLOUDTHAT_AG_CAMPAIGN_NAME.toLowerCase()
  );
}

export function isCloudThatAgLeadTagging(
  value: string | null | undefined
): boolean {
  const trimmed = (value ?? "").trim();
  return CLOUDTHAT_AG_LEAD_TAGGING_VALUES.includes(trimmed);
}

/** Azure / SCI hide DEMAND & QUALIFICATION INSIGHTS; GCP keeps it visible. */
export function shouldShowDemandForCloudThatAgTagging(
  leadTagging: string | null | undefined
): boolean {
  const trimmed = (leadTagging ?? "").trim();
  if (!trimmed) return false;
  if (trimmed === CLOUDTHAT_AG_LEAD_TAGGING.GCP) return true;
  if (
    trimmed === CLOUDTHAT_AG_LEAD_TAGGING.AZURE ||
    trimmed === CLOUDTHAT_AG_LEAD_TAGGING.SCI
  ) {
    return false;
  }
  // Unknown / legacy tag on this campaign: keep section hidden until a known tag is set.
  return false;
}
