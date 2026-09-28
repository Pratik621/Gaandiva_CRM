/**
 * Command Center shared TypeScript types.
 * Used as explicit casts where Supabase inference resolves to `never`
 * due to version-specific type computation limits.
 */

export interface CommandProfile {
  organization_id: string | null;
}

export interface CommandRoleRow {
  roles: { name: string } | null;
}

export interface CommandCampaignMetricsRow {
  id: string;
  campaign_id: string;
  sponsor_name: string | null;
  total_leads_allocated: number | null;
  total_campaign_spend: number | null;
  total_leads_delivered: number | null;
  daily_reporting: unknown;
  channel_split: unknown;
  deficit_leads: number | null;
  lead_increment: number | null;
  lead_replace: number | null;
  created_at: string;
  updated_at: string;
}

export interface CommandCampaignMetricsHistoryRow {
  id: string;
  campaign_id: string;
  date: string;
  total_leads_delivered: number | null;
  channel_split: unknown;
  deficit_leads: number | null;
  lead_increment: number | null;
  lead_replace: number | null;
  total_campaign_spend: number | null;
  updated_by: string | null;
  created_at: string;
}

export interface CommandLeadRow {
  id: string;
  status: string;
  consent_status: string | null;
  channel: string | null;
  risk_flags: unknown;
  campaign_id: string;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommandAlertRow {
  id: string;
  organization_id?: string;
  campaign_id: string | null;
  lead_id: string | null;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string | null;
  metadata?: unknown;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  resolution_category?: string | null;
  display_id?: number;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  created_by?: string | null;
  created_at: string;
  campaigns?: { name: string } | null;
  resolved_by_user?: { full_name: string | null; email: string | null } | null;
  acknowledged_by_user?: { full_name: string | null; email: string | null } | null;
}

export interface CommandLeadHistoryRow {
  id: string;
  lead_id: string;
  changed_by: string;
  change_type: string;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
  previous_status: string | null;
  new_status: string | null;
  trigger_source: "system" | "manual";
  reason_code: string | null;
  metadata: unknown;
}

export interface CommandConsentRow {
  id: string;
  lead_id: string;
  campaign_id: string;
  consent_given_at: string | null;
  consent_method: string | null;
  ip_address: string | null;
  recording_url: string | null;
  consent_text: string | null;
  sha256_hash: string | null;
  created_at: string;
}
