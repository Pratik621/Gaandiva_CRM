/**
 * Lead types and constants for Audit & Lead Information
 */

import type { VoiceRecording } from "@/lib/voice-recordings";

export type Lead = {
  id: string;
  lead_id: string | null;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: string;
  followup_date: string | null;
  notes: string | null;
  assigned_agent_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_agent_name: string | null;
  created_by_name: string | null;
  /** QA auditor display name (qa_name or resolved from qa_audited_by_id). */
  audit_by_name?: string | null;
  channel?: "Email" | "Telemarketing" | null;
  /** Per-lead type set by agent (e.g. MQL, HQL). */
  lead_type?: string | null;
  // Contact Person
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  domain: string | null;
  direct_number: string | null;
  company_number: string | null;
  phone_number_link: string | null;
  job_title: string | null;
  job_level: string | null;
  department: string | null;
  job_title_link: string | null;
  tenurity: string | null;
  vv_status: string | null;
  email_status: string | null;
  ev_tool: string | null;
  // Company
  address: string | null;
  address2?: string | null;
  address_link?: string | null;
  state: string | null;
  country: string | null;
  zip_code: string | null;
  employee_size: string | null;
  actual_employee_size?: string | null;
  see_all_employees: string | null;
  industry: string | null;
  industry_type_link?: string | null;
  employee_size_link: string | null;
  company_website_link: string | null;
  revenue_range: string | null;
  revenue_link: string | null;
  sic_code: string | null;
  sic_code_link: string | null;
  naics_code: string | null;
  naics_code_link: string | null;
  founded_years: number | null;
  founded_years_link: string | null;
  contact_linkedin_url: string | null;
  company_linkedin_url: string | null;
  scored: string | null;
  scored_timezone: string | null;
  appointment: string | null;
  appointment_timezone: string | null;
  lead_tagging: string | null;
  job_function: string | null;
  // QA & Call
  ra_comment: string | null;
  special_comments: string | null;
  call_back: string | null;
  call_notes: string | null;
  primary_reason: string | null;
  secondary_reason: string | null;
  qa_comments: string | null;
  // Compliance
  cq1: string | null;
  cq2: string | null;
  cq3: string | null;
  cq4: string | null;
  cq5: string | null;
  /** CQ6+ — keys cq6, cq7, … */
  extra_cq?: Record<string, string> | null;
  // Audit
  audit_date: string | null;
  qa_name: string | null;
  qa_audited_by_id: string | null;
  qa_audited_at: string | null;
  qa_status: string | null;
  billable_status?: string | null;
  client_feedback_status?: "pending" | "rejected" | null;
  delivery_status: "pending" | "not_delivered" | "delivered" | "client_rejected" | null;
  delivered_at: string | null;
  delivered_by: string | null;
  /** MIS user who marked the lead delivered (resolved from delivered_by). */
  delivered_by_name?: string | null;
  disqualification_reasons: string | null;
  disqualification_reason: string | null;
  rectified_reason: string | null;
  rectification_status?: string | null;
  rectification_qa_name?: string | null;
  rectification_date?: string | null;
  asset_title: string | null;
  asset_title2?: string | null;
  delivery_remark?: string | null;
  lead_disposition: string | null;
  /** Campaign team leader display name (export enrichment). */
  team_leader_name?: string | null;
  /** Populated on agent campaign leads list for inline table playback. */
  voice_recordings?: VoiceRecording[];
};

export const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "followup", label: "Follow-up" },
  { value: "closed_won", label: "Closed Won" },
  { value: "closed_lost", label: "Closed Lost" },
];

export const QA_STATUS_OPTIONS = [
  { value: "qualified", label: "Qualified" },
  { value: "disqualified", label: "Disqualified" },
  { value: "rectified", label: "Rectified" },
];

export const LEAD_TAGGING_OPTIONS = [
  { value: "Scored", label: "Scored" },
  { value: "Not Interested", label: "Not Interested" },
  { value: "Voicemail", label: "Voicemail" },
  { value: "Call Dropped", label: "Call Dropped" },
  { value: "Invalid Number", label: "Invalid Number" },
  { value: "Number Not Reachable", label: "Number Not Reachable" },
  { value: "Call Back", label: "Call Back" },
  { value: "Dead Contact", label: "Dead Contact" },
  { value: "Gatekeeper Declined", label: "Gatekeeper Declined" },
  { value: "Follow-up Scheduled", label: "Follow-up Scheduled" },
  { value: "Do Not Call", label: "Do Not Call" },
];

export const SALUTATION_OPTIONS = [
  { value: "Mr", label: "Mr" },
  { value: "Mrs", label: "Mrs" },
  { value: "Ms", label: "Ms" },
  { value: "Dr", label: "Dr" },
  { value: "Prof", label: "Prof" },
];

export const JOB_FUNCTION_OPTIONS = [
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "it", label: "IT" },
  { value: "hr", label: "HR" },
  { value: "other", label: "Other" },
];

export const JOB_LEVEL_OPTIONS = [
  { value: "entry", label: "Staff" },
  { value: "mid", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "vp", label: "VP" },
  { value: "c_level", label: "C-level" },
  { value: "owner", label: "Owner / Founder" },
];

export const EMPLOYEE_SIZE_OPTIONS = [
  { value: "1-10", label: "1-10" },
  { value: "11-50", label: "11-50" },
  { value: "51-200", label: "51-200" },
  { value: "201-500", label: "201-500" },
  { value: "501-1000", label: "501-1000" },
  { value: "1001-5000", label: "1001-5000" },
  { value: "5001-10000", label: "5001-10000" },
  { value: "10001+", label: "10001+" },
];

export const DISPOSITION_OPTIONS = [
  { value: "new_lead", label: "New Lead" },
  { value: "working", label: "Working" },
  { value: "qualified", label: "Qualified" },
  { value: "unqualified", label: "Unqualified" },
  { value: "nurture", label: "Nurture" },
];

export const DISQUALIFICATION_REASONS_OPTIONS = [
  "Wrong Persona",
  "Out of Geography",
  "No Budget",
  "No Timeline",
  "Not Decision Maker",
  "Duplicate Lead",
  "Invalid Contact",
  "No Response",
  "Not Interested",
  "Competitor",
  "Out of Scope",
  "Wrong Industry",
  "Company Size",
  "Other",
].map((v) => ({ value: v, label: v }));

export const QA_AUDIT_DISQUALIFICATION_OPTIONS = [
  "Invalid Job Title",
  "Invalid Job Level",
  "Invalid Geography",
  "Invalid Employee Size",
  "Invalid Industry",
  "Invalid Revenue Size",
  "Invalid SIC/NAICS Code",
  "Invalid Employee size Link",
  "Invalid Job title Link",
  "Invalid Industry Link",
  "Invalid Revenue Link",
  "Internal Suppression",
  "External suppression",
  "Invalid Account List",
  "Invalid Asset Name",
  "Duplicate Lead",
  "Dead Contact",
  "Incorrect Value Proposition",
  "Suspect Profile",
  "Invalid Intent",
  "Incorrect Call Approach",
  "Incorrect Call Closing",
  "Invalid Custom Question",
  "Email Bounce Back",
  "Invalid Email",
  "Invalid Domain",
  "Invalid Address",
  "Inappropriate Call",
  "Incorrect Company Details",
  "CPC Exceeded",
  "Voice log Error",
  "Not intrested",
  "Invalid Phone Number",
  "Not RPC",
  "Invalid Details",
  "Script Not followed",
  "Invalid Answer",
].map((v) => ({ value: v, label: v }));
