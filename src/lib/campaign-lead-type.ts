/** Parse campaign.lead_type (comma-separated tags) into select options. */
export function parseCampaignLeadTypeOptions(
  campaignLeadType: string | null | undefined
): { value: string; label: string }[] {
  if (!campaignLeadType?.trim()) return [];
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  for (const part of campaignLeadType.split(/[,;]/)) {
    const v = part.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    options.push({ value: v, label: v });
  }
  return options;
}

/** Prefer per-lead type; fall back to campaign default for legacy rows. */
export function resolveLeadTypeForExport(
  leadType: string | null | undefined,
  campaignLeadType?: string | null
): string {
  const perLead = leadType?.trim();
  if (perLead) return perLead;
  return campaignLeadType?.trim() ?? "";
}
