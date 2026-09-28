import type { Step } from "react-joyride";
import { AGENT_TOUR_TARGETS } from "@/lib/agent-tour/constants";

export const AGENT_TOUR_STEPS: Step[] = [
  {
    target: AGENT_TOUR_TARGETS.sidebarCampaigns,
    title: "Campaigns",
    content: "Click here to view assigned campaigns.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: AGENT_TOUR_TARGETS.campaignName,
    title: "Choose a campaign",
    content: "Click the campaign you want to work on.",
    placement: "bottom",
  },
  {
    target: AGENT_TOUR_TARGETS.addLead,
    title: "Add Lead",
    content: "Click Add Lead to submit a new lead.",
    placement: "bottom",
  },
  {
    target: AGENT_TOUR_TARGETS.leadRequired,
    title: "Required fields",
    content:
      "Fill all mandatory fields before saving. Look for fields marked with a red asterisk (*).",
    placement: "bottom",
    disableBeacon: true,
    spotlightPadding: 6,
    floaterProps: {
      offset: 14,
      options: {
        preventOverflow: {
          boundariesElement: "viewport",
          padding: 16,
        },
      },
    },
  },
  {
    target: AGENT_TOUR_TARGETS.lhoPdf,
    title: "Meeting Report (LHO) PDF",
    content:
      "The Meeting Report PDF can be generated after you enter the required lead information.",
    placement: "top",
    spotlightPadding: 6,
    floaterProps: {
      offset: 12,
      options: {
        preventOverflow: {
          boundariesElement: "viewport",
          padding: 16,
        },
      },
    },
  },
  {
    target: AGENT_TOUR_TARGETS.saveLead,
    title: "Save lead",
    content: "Click Create Lead to submit the lead.",
    placement: "top",
    spotlightPadding: 6,
    floaterProps: {
      offset: 12,
      options: {
        preventOverflow: {
          boundariesElement: "viewport",
          padding: 16,
        },
      },
    },
  },
  {
    target: AGENT_TOUR_TARGETS.bulkUpload,
    title: "Bulk upload",
    content:
      "You can also upload leads in bulk using Excel/CSV. Download the sample format, fill it in, then upload the file.",
    placement: "bottom",
  },
];
