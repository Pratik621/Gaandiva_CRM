export const AGENT_TOUR_TARGETS = {
  sidebarCampaigns: '[data-tour="agent-sidebar-campaigns"]',
  campaignName: '[data-tour="agent-campaign-name"]',
  addLead: '[data-tour="agent-add-lead"]',
  leadRequired: '[data-tour="agent-lead-required-fields"]',
  lhoPdf: '[data-tour="agent-lho-pdf"]',
  saveLead: '[data-tour="agent-save-lead"]',
  bulkUpload: '[data-tour="agent-bulk-upload"]',
} as const;

export const AGENT_TOUR_STEP_COUNT = 7;

export const AGENT_TOUR_OPEN_LEAD_DRAWER_EVENT = "agent-tour:open-lead-drawer";
export const AGENT_TOUR_CLOSE_LEAD_DRAWER_EVENT = "agent-tour:close-lead-drawer";
export const AGENT_TOUR_LEAD_DRAWER_CLOSED_EVENT = "agent-tour:lead-drawer-closed";
