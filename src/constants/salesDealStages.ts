/** Pipeline stages for deal create / select (labels match deals board). */
export const DEAL_STAGE_SELECT_OPTIONS = [
  { value: "introductory_meeting", label: "Introductory meeting" },
  { value: "campaign_assessment", label: "Campaign assessment" },
  { value: "strategy_proposal", label: "Strategy proposal" },
  { value: "strategy_presentation", label: "Strategy presentation" },
  { value: "objection_handling", label: "Objection handling" },
  { value: "finalizing_terms", label: "Finalizing terms" },
  { value: "closed_won", label: "Closed won" },
  { value: "closed_lost", label: "Closed lost" },
] as const;
