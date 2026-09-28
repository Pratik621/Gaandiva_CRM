import type { LhoData } from "@/lib/generateLhoPdf";
import {
  buildLhoCampaignQuestionRows,
  resolveCampaignQuestionsFromLeadRaw,
} from "@/lib/lho/campaign-cq-pdf";
import {
  formatMeetingReportDate,
  formatMeetingReportTime,
  resolveAgentName,
  resolveClientName,
} from "@/lib/lho/meeting-report-format";
import {
  normalizeCqAnswerValue,
  type CampaignQuestion,
} from "@/lib/campaign-questions";
import {
  isCloudThatAgCampaign,
  shouldShowDemandForCloudThatAgTagging,
} from "@/lib/cloudthat-ag";

function str(val: unknown): string {
  return val != null ? String(val).trim() : "";
}

function normalizeExtraCqMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = normalizeCqAnswerValue(value);
    if (v) out[key] = v;
  }
  return out;
}

function formatLegacyDateTime(val: unknown, tz: unknown): string {
  const s = str(val);
  if (!s) return "";
  const wall = s.includes("T") ? s.slice(0, 16).replace("T", " ") : s;
  const tzLabel = str(tz);
  return tzLabel ? `${wall} (${tzLabel})` : wall;
}

function resolveCampaignName(raw: Record<string, unknown>): string {
  const direct = str(raw.campaign_name);
  if (direct) return direct;
  const campaigns = raw.campaigns;
  if (campaigns && typeof campaigns === "object" && !Array.isArray(campaigns)) {
    return str((campaigns as Record<string, unknown>).name);
  }
  return "";
}

export function buildLhoDataFromLead(
  raw: Record<string, unknown>,
  options?: {
    campaignQuestions?: CampaignQuestion[] | null;
    campaignName?: string | null;
  }
): LhoData {
  const scoredAt = str(raw.scored) || null;
  const scoredTimezone = str(raw.scored_timezone) || null;
  const appointmentAt = str(raw.appointment) || null;
  const appointmentTimezone = str(raw.appointment_timezone) || null;
  const leadTagging = str(raw.lead_tagging);

  const cqFields = {
    cq1: normalizeCqAnswerValue(raw.cq1),
    cq2: normalizeCqAnswerValue(raw.cq2),
    cq3: normalizeCqAnswerValue(raw.cq3),
    cq4: normalizeCqAnswerValue(raw.cq4),
    cq5: normalizeCqAnswerValue(raw.cq5),
    extraCq: normalizeExtraCqMap(raw.extra_cq),
  };

  const campaignName =
    str(options?.campaignName) || resolveCampaignName(raw);
  const campaignQuestionConfig =
    options?.campaignQuestions ?? resolveCampaignQuestionsFromLeadRaw(raw);

  // Align with LeadForm: CloudThat AG Azure/SCI hide DEMAND; GCP shows it.
  const includeDemandSection =
    !isCloudThatAgCampaign(campaignName) ||
    shouldShowDemandForCloudThatAgTagging(leadTagging);

  return {
    salutation: str(raw.salutation),
    firstName: str(raw.first_name),
    lastName: str(raw.last_name),
    email: str(raw.email),
    phone: str(raw.phone),
    directNumber: str(raw.direct_number),
    jobTitle: str(raw.job_title),
    jobLevel: str(raw.job_level),
    department: str(raw.department),
    jobFunction: str(raw.job_function),
    jobTitleLink: str(raw.job_title_link),
    contactLinkedIn: str(raw.contact_linkedin_url),
    phoneNumberLink: str(raw.phone_number_link),
    channel: str(raw.channel),
    companyName: str(raw.company_name),
    domain: str(raw.domain),
    companyNumber: str(raw.company_number),
    address: str(raw.address),
    city: str(raw.city),
    state: str(raw.state),
    country: str(raw.country),
    zipCode: str(raw.zip_code),
    employeeSize: str(raw.employee_size),
    seeAllEmployees: str(raw.see_all_employees),
    industry: str(raw.industry),
    employeeSizeLink: str(raw.employee_size_link),
    companyWebsite: str(raw.company_website_link),
    companyLinkedIn: str(raw.company_linkedin_url),
    revenueRange: str(raw.revenue_range),
    revenueLink: str(raw.revenue_link),
    sicCode: str(raw.sic_code),
    sicCodeLink: str(raw.sic_code_link),
    naicsCode: str(raw.naics_code),
    naicsCodeLink: str(raw.naics_code_link),
    foundedYears: str(raw.founded_years),
    foundedYearsLink: str(raw.founded_years_link),
    callBack: str(raw.call_back),
    callNotes: str(raw.call_notes),
    ...cqFields,
    campaignQuestions: includeDemandSection
      ? buildLhoCampaignQuestionRows(cqFields, campaignQuestionConfig)
      : [],
    leadDisposition: str(raw.lead_disposition),
    leadTagging,
    assetTitle: str(raw.asset_title),
    tenurity: str(raw.tenurity),
    vvStatus: str(raw.vv_status),
    emailStatus: str(raw.email_status),
    evTool: str(raw.ev_tool),
    scoredAt,
    scoredTimezone,
    appointmentAt,
    appointmentTimezone,
    scored: formatLegacyDateTime(scoredAt, scoredTimezone),
    appointment: formatLegacyDateTime(appointmentAt, appointmentTimezone),
    client: resolveClientName(raw),
    preparedBy: resolveClientName(raw),
    agentName: resolveAgentName(raw),
    meetingSetDate: formatMeetingReportDate(scoredAt, scoredTimezone),
    meetingDate: formatMeetingReportDate(appointmentAt, appointmentTimezone),
    meetingTime: formatMeetingReportTime(appointmentAt, appointmentTimezone),
    raComment: str(raw.ra_comment),
    specialComments: str(raw.special_comments),
    notes: str(raw.notes),
  };
}
