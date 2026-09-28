"use client";

import React from "react";
import { Typography } from "antd";
import { LeadForm } from "./LeadForm";
import type { Lead } from "@/types/lead.types";
import type { CampaignQuestion } from "@/lib/campaign-questions";

export const LEAD_DRAWER_WIDTH = 1080;
export const LEAD_DRAWER_BODY_STYLE = { paddingBottom: 80 } as const;
export const LEAD_DRAWER_INTRO_STYLE = { marginBottom: 20, fontSize: 13 } as const;

const DEFAULT_INTRO = "Update lead details. All fields are organized in collapsible sections.";

type LeadDrawerContentProps = {
  form: ReturnType<typeof import("antd").Form.useForm>[0];
  mode: "create" | "edit";
  lead?: Lead | null;
  canEditQaAudit?: boolean;
  introText?: string;
  campaignQuestions?: CampaignQuestion[] | null;
  campaignName?: string | null;
  showLeadTypeField?: boolean;
  leadTypeOptions?: { value: string; label: string }[];
  hidePhoneNumber?: boolean;
};

export function LeadDrawerContent({
  form,
  mode,
  lead,
  canEditQaAudit = false,
  introText = DEFAULT_INTRO,
  campaignQuestions = null,
  campaignName = null,
  showLeadTypeField = false,
  leadTypeOptions = [],
  hidePhoneNumber = false,
}: LeadDrawerContentProps) {
  return (
    <>
      <Typography.Paragraph type="secondary" style={LEAD_DRAWER_INTRO_STYLE}>
        {introText}
      </Typography.Paragraph>
      <LeadForm
        form={form}
        mode={mode}
        lead={lead}
        canEditQaAudit={canEditQaAudit}
        campaignQuestions={campaignQuestions}
        campaignName={campaignName}
        showLeadTypeField={showLeadTypeField}
        leadTypeOptions={leadTypeOptions}
        hidePhoneNumber={hidePhoneNumber}
      />
    </>
  );
}
