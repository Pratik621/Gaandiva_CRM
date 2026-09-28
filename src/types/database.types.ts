/**
 * Supabase Database Types - User Module
 * Auto-generated from Gandiv_CRM project
 * Regenerate with: MCP Gandiv_CRM generate_typescript_types
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      login_logs: {
        Row: {
          device_info: string | null;
          id: string;
          ip_address: string | null;
          login_time: string;
          user_id: string;
        };
        Insert: {
          device_info?: string | null;
          id?: string;
          ip_address?: string | null;
          login_time?: string;
          user_id: string;
        };
        Update: {
          device_info?: string | null;
          id?: string;
          ip_address?: string | null;
          login_time?: string;
          user_id?: string;
        };
      };
      org_mfa_settings: {
        Row: {
          organization_id: string;
          enforced: boolean;
          grace_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          enforced?: boolean;
          grace_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          enforced?: boolean;
          grace_ends_at?: string | null;
          updated_at?: string;
        };
      };
      org_device_settings: {
        Row: {
          organization_id: string;
          enabled: boolean;
          grace_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          enabled?: boolean;
          grace_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          enabled?: boolean;
          grace_ends_at?: string | null;
          updated_at?: string;
        };
      };
      trusted_devices: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          token_hash: string;
          device_name: string;
          browser: string | null;
          os: string | null;
          ip_at_registration: string | null;
          location_approx: string | null;
          status: string;
          approved_by: string | null;
          approved_at: string | null;
          rejected_at: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          last_seen_at: string | null;
          last_notified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          token_hash: string;
          device_name?: string;
          browser?: string | null;
          os?: string | null;
          ip_at_registration?: string | null;
          location_approx?: string | null;
          status?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          rejected_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          last_seen_at?: string | null;
          last_notified_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          token_hash?: string;
          device_name?: string;
          browser?: string | null;
          os?: string | null;
          ip_at_registration?: string | null;
          location_approx?: string | null;
          status?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          rejected_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          last_seen_at?: string | null;
          last_notified_at?: string | null;
          created_at?: string;
        };
      };
      user_mfa_enrollment: {
        Row: {
          user_id: string;
          organization_id: string;
          email_enrolled_at: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          organization_id: string;
          email_enrolled_at?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          organization_id?: string;
          email_enrolled_at?: string | null;
          updated_at?: string;
        };
      };
      auth_events: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          event_type: string;
          channel: string | null;
          ip: string | null;
          user_agent: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          event_type: string;
          channel?: string | null;
          ip?: string | null;
          user_agent?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          event_type?: string;
          channel?: string | null;
          ip?: string | null;
          user_agent?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
      };
      mfa_backup_codes: {
        Row: {
          id: string;
          user_id: string;
          code_hash: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          code_hash: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          code_hash?: string;
          used_at?: string | null;
          created_at?: string;
        };
      };
      mfa_email_otps: {
        Row: {
          id: string;
          user_id: string;
          code_hash: string;
          expires_at: string;
          attempts: number;
          consumed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          code_hash: string;
          expires_at: string;
          attempts?: number;
          consumed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          code_hash?: string;
          expires_at?: string;
          attempts?: number;
          consumed_at?: string | null;
          created_at?: string;
        };
      };
      password_reset_tokens: {
        Row: {
          id: string;
          user_id: string;
          token_hash: string;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token_hash: string;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token_hash?: string;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          plan_type: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          plan_type?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          plan_type?: string | null;
        };
      };
      roles: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
        };
      };
      user_roles: {
        Row: {
          id: string;
          role_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          role_id: string;
          user_id: string;
        };
        Update: {
          id?: string;
          role_id?: string;
          user_id?: string;
        };
      };
      user_settings: {
        Row: {
          user_id: string;
          product_tour_completed: boolean;
          product_tour_dismissed: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          product_tour_completed?: boolean;
          product_tour_dismissed?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          product_tour_completed?: boolean;
          product_tour_dismissed?: boolean;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          created_at: string;
          department: string | null;
          designation: string | null;
          email: string | null;
          employment_type: string | null;
          full_name: string | null;
          id: string;
          organization_id: string | null;
          phone: string | null;
          reporting_manager_id: string | null;
          status: string;
          agent_code: string | null;
          date_of_birth: string | null;
          avatar_url: string | null;
          employee_id: string | null;
          joining_date: string | null;
          client_id: string | null;
        };
        Insert: {
          created_at?: string;
          department?: string | null;
          designation?: string | null;
          email?: string | null;
          employment_type?: string | null;
          full_name?: string | null;
          id: string;
          organization_id?: string | null;
          phone?: string | null;
          reporting_manager_id?: string | null;
          status?: string;
          agent_code?: string | null;
          date_of_birth?: string | null;
          avatar_url?: string | null;
          employee_id?: string | null;
          joining_date?: string | null;
          client_id?: string | null;
        };
        Update: {
          created_at?: string;
          department?: string | null;
          designation?: string | null;
          email?: string | null;
          employment_type?: string | null;
          full_name?: string | null;
          id?: string;
          organization_id?: string | null;
          phone?: string | null;
          reporting_manager_id?: string | null;
          status?: string;
          agent_code?: string | null;
          date_of_birth?: string | null;
          avatar_url?: string | null;
          employee_id?: string | null;
          joining_date?: string | null;
          client_id?: string | null;
        };
      };
      campaigns: {
        Row: {
          id: string;
          campaign_id: string;
          organization_id: string;
          name: string;
          description: string | null;
          industry: string | null;
          geography: string | null;
          target_designation: string | null;
          start_date: string | null;
          end_date: string | null;
          status: string;
          qualification_criteria: Json;
          alert_config: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          client_id: string | null;
          client_name: string | null;
          lead_type: string | null;
          campaign_type: string | null;
          cpl: number | null;
          revenue: number | null;
          booked: number | null;
          total_allocation: number | null;
          post_qa: number | null;
          achieved: number | null;
          pending_allocation: number | null;
          weekly_call: string | null;
          weekly_report: string | null;
          additional_comments: string | null;
          assigned_team_leader_id: string | null;
          employee_size: string[] | null;
          revenue_size: string[] | null;
          abm: boolean | null;
          seniority: string | null;
          job_function: string | null;
          creatives_url: string[] | null;
          lead_aggregated: string | null;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          organization_id: string;
          name: string;
          description?: string | null;
          industry?: string | null;
          geography?: string | null;
          target_designation?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          status?: string;
          qualification_criteria?: Json;
          alert_config?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          client_id?: string | null;
          client_name?: string | null;
          lead_type?: string | null;
          campaign_type?: string | null;
          cpl?: number | null;
          revenue?: number | null;
          booked?: number | null;
          total_allocation?: number | null;
          post_qa?: number | null;
          achieved?: number | null;
          pending_allocation?: number | null;
          weekly_call?: string | null;
          weekly_report?: string | null;
          additional_comments?: string | null;
          assigned_team_leader_id?: string | null;
          employee_size?: string[] | null;
          revenue_size?: string[] | null;
          abm?: boolean | null;
          seniority?: string | null;
          job_function?: string | null;
          creatives_url?: string[] | null;
          lead_aggregated?: string | null;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          industry?: string | null;
          geography?: string | null;
          target_designation?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          status?: string;
          qualification_criteria?: Json;
          alert_config?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          client_id?: string | null;
          client_name?: string | null;
          lead_type?: string | null;
          campaign_type?: string | null;
          cpl?: number | null;
          revenue?: number | null;
          booked?: number | null;
          total_allocation?: number | null;
          post_qa?: number | null;
          achieved?: number | null;
          pending_allocation?: number | null;
          weekly_call?: string | null;
          weekly_report?: string | null;
          additional_comments?: string | null;
          assigned_team_leader_id?: string | null;
          employee_size?: string[] | null;
          revenue_size?: string[] | null;
          abm?: boolean | null;
          seniority?: string | null;
          job_function?: string | null;
          creatives_url?: string[] | null;
          lead_aggregated?: string | null;
        };
      };
      campaign_assignments: {
        Row: {
          id: string;
          organization_id: string;
          campaign_id: string;
          agent_id: string;
          assigned_by: string | null;
          assigned_at: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          campaign_id: string;
          agent_id: string;
          assigned_by?: string | null;
          assigned_at?: string;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          campaign_id?: string;
          agent_id?: string;
          assigned_by?: string | null;
          assigned_at?: string;
          is_active?: boolean;
        };
      };
      campaign_files: {
        Row: {
          id: string;
          campaign_id: string;
          organization_id: string;
          file_name: string;
          file_path: string;
          file_size: number | null;
          mime_type: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          organization_id: string;
          file_name: string;
          file_path: string;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          organization_id?: string;
          file_name?: string;
          file_path?: string;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
      };
      lead_assets: {
        Row: {
          id: string;
          organization_id: string;
          campaign_id: string;
          lead_id: string;
          asset_type: "voice" | "lho";
          file_name: string;
          file_path: string;
          file_size: number | null;
          mime_type: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          campaign_id: string;
          lead_id: string;
          asset_type: "voice" | "lho";
          file_name: string;
          file_path: string;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          campaign_id?: string;
          lead_id?: string;
          asset_type?: "voice" | "lho";
          file_name?: string;
          file_path?: string;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
      };
      clients: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string | null;
          created_at: string;
          company_name: string;
          company_website: string | null;
          industry_type: string | null;
          company_size: string | null;
          year_established: number | null;
          company_address: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
          contact_person: string | null;
          contact_full_name: string | null;
          contact_designation: string | null;
          contact_work_email: string | null;
          contact_mobile: string | null;
          contact_linkedin: string | null;
          services_products_offered: string | null;
          target_market: string | null;
          target_geography: string | null;
          current_revenue_range: string | null;
          existing_crm: boolean | null;
          existing_crm_which: string | null;
          problem_solving: string | null;
          services_looking_for: string | null;
          budget_range: string | null;
          expected_start_date: string | null;
          logo_url: string | null;
          logo_urls: string[];
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_by?: string | null;
          created_at?: string;
          company_name: string;
          company_website?: string | null;
          industry_type?: string | null;
          company_size?: string | null;
          year_established?: number | null;
          company_address?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          contact_person?: string | null;
          contact_full_name?: string | null;
          contact_designation?: string | null;
          contact_work_email?: string | null;
          contact_mobile?: string | null;
          contact_linkedin?: string | null;
          services_products_offered?: string | null;
          target_market?: string | null;
          target_geography?: string | null;
          current_revenue_range?: string | null;
          existing_crm?: boolean | null;
          existing_crm_which?: string | null;
          problem_solving?: string | null;
          services_looking_for?: string | null;
          budget_range?: string | null;
          expected_start_date?: string | null;
          logo_url?: string | null;
          logo_urls?: string[];
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_by?: string | null;
          created_at?: string;
          company_name?: string;
          company_website?: string | null;
          industry_type?: string | null;
          company_size?: string | null;
          year_established?: number | null;
          company_address?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          contact_person?: string | null;
          contact_full_name?: string | null;
          contact_designation?: string | null;
          contact_work_email?: string | null;
          contact_mobile?: string | null;
          contact_linkedin?: string | null;
          services_products_offered?: string | null;
          target_market?: string | null;
          target_geography?: string | null;
          current_revenue_range?: string | null;
          existing_crm?: boolean | null;
          existing_crm_which?: string | null;
          problem_solving?: string | null;
          services_looking_for?: string | null;
          budget_range?: string | null;
          expected_start_date?: string | null;
          logo_url?: string | null;
          logo_urls?: string[];
        };
      };
      leads: {
        Row: {
          id: string;
          organization_id: string;
          campaign_id: string;
          assigned_agent_id: string | null;
          name: string | null;
          company_name: string | null;
          phone: string | null;
          email: string | null;
          city: string | null;
          status: string;
          followup_date: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          risk_flags: Json | null;
          consent_status: "pending" | "verified" | "missing" | "disputed";
          channel: "email" | "telemarketing";
          rep_id: string | null;
          ingested_at: string;
          qualified_at: string | null;
          registered_at: string | null;
          dq_reason_code: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          campaign_id: string;
          assigned_agent_id?: string | null;
          name?: string | null;
          company_name?: string | null;
          phone?: string | null;
          email?: string | null;
          city?: string | null;
          status?: string;
          followup_date?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          risk_flags?: Json | null;
          consent_status?: "pending" | "verified" | "missing" | "disputed";
          channel?: "email" | "telemarketing";
          rep_id?: string | null;
          ingested_at?: string;
          qualified_at?: string | null;
          registered_at?: string | null;
          dq_reason_code?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          campaign_id?: string;
          assigned_agent_id?: string | null;
          name?: string | null;
          company_name?: string | null;
          phone?: string | null;
          email?: string | null;
          city?: string | null;
          status?: string;
          followup_date?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          risk_flags?: Json | null;
          consent_status?: "pending" | "verified" | "missing" | "disputed";
          channel?: "email" | "telemarketing";
          rep_id?: string | null;
          ingested_at?: string;
          qualified_at?: string | null;
          registered_at?: string | null;
          dq_reason_code?: string | null;
        };
      };
      lead_duplicate_keys: {
        Row: {
          lead_id: string;
          organization_id: string;
          campaign_id: string;
          key_type: string;
          normalized_value: string;
          created_at: string;
        };
        Insert: {
          lead_id: string;
          organization_id: string;
          campaign_id: string;
          key_type: string;
          normalized_value: string;
          created_at?: string;
        };
        Update: {
          lead_id?: string;
          organization_id?: string;
          campaign_id?: string;
          key_type?: string;
          normalized_value?: string;
          created_at?: string;
        };
      };
      campaign_metrics: {
        Row: {
          id: string;
          campaign_id: string;
          sponsor_name: string | null;
          total_leads_allocated: number | null;
          total_campaign_spend: number | null;
          total_leads_delivered: number | null;
          daily_reporting: Json | null;
          channel_split: Json | null;
          deficit_leads: number | null;
          lead_increment: number | null;
          lead_replace: number | null;
          total_leads: number | null;
          qa_pending_count: number | null;
          qualified_count: number | null;
          registered_count: number | null;
          attended_count: number | null;
          disqualified_count: number | null;
          no_show_count: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          sponsor_name?: string | null;
          total_leads_allocated?: number | null;
          total_campaign_spend?: number | null;
          total_leads_delivered?: number | null;
          daily_reporting?: Json | null;
          channel_split?: Json | null;
          deficit_leads?: number | null;
          lead_increment?: number | null;
          lead_replace?: number | null;
          total_leads?: number | null;
          qa_pending_count?: number | null;
          qualified_count?: number | null;
          registered_count?: number | null;
          attended_count?: number | null;
          disqualified_count?: number | null;
          no_show_count?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          sponsor_name?: string | null;
          total_leads_allocated?: number | null;
          total_campaign_spend?: number | null;
          total_leads_delivered?: number | null;
          daily_reporting?: Json | null;
          channel_split?: Json | null;
          deficit_leads?: number | null;
          lead_increment?: number | null;
          lead_replace?: number | null;
          total_leads?: number | null;
          qa_pending_count?: number | null;
          qualified_count?: number | null;
          registered_count?: number | null;
          attended_count?: number | null;
          disqualified_count?: number | null;
          no_show_count?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      campaign_metrics_history: {
        Row: {
          id: string;
          campaign_id: string;
          date: string;
          total_leads_delivered: number | null;
          channel_split: Json | null;
          deficit_leads: number | null;
          lead_increment: number | null;
          lead_replace: number | null;
          total_campaign_spend: number | null;
          updated_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          date?: string;
          total_leads_delivered?: number | null;
          channel_split?: Json | null;
          deficit_leads?: number | null;
          lead_increment?: number | null;
          lead_replace?: number | null;
          total_campaign_spend?: number | null;
          updated_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          date?: string;
          total_leads_delivered?: number | null;
          channel_split?: Json | null;
          deficit_leads?: number | null;
          lead_increment?: number | null;
          lead_replace?: number | null;
          total_campaign_spend?: number | null;
          updated_by?: string | null;
          created_at?: string;
        };
      };
      lead_history: {
        Row: {
          id: string;
          lead_id: string;
          changed_by: string;
          change_type: string;
          old_value: Json | null;
          new_value: Json | null;
          reason: string | null;
          ip_address: string | null;
          created_at: string;
          previous_status: string | null;
          new_status: string | null;
          trigger_source: "system" | "manual";
          reason_code: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          lead_id: string;
          changed_by: string;
          change_type: string;
          old_value?: Json | null;
          new_value?: Json | null;
          reason?: string | null;
          ip_address?: string | null;
          created_at?: string;
          previous_status?: string | null;
          new_status?: string | null;
          trigger_source?: "system" | "manual";
          reason_code?: string | null;
          metadata?: Json;
        };
        Update: {
          id?: string;
          lead_id?: string;
          changed_by?: string;
          change_type?: string;
          old_value?: Json | null;
          new_value?: Json | null;
          reason?: string | null;
          ip_address?: string | null;
          created_at?: string;
          previous_status?: string | null;
          new_status?: string | null;
          trigger_source?: "system" | "manual";
          reason_code?: string | null;
          metadata?: Json;
        };
      };
      lead_transfer_history: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string | null;
          lead_count: number;
          lead_ids: string[] | null;
          campaign_id: string | null;
          from_agent_id: string;
          to_agent_id: string;
          transferred_by_tl_id: string;
          transfer_mode: "all" | "campaign" | "selected";
          transferred_at: string;
          notes: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lead_id?: string | null;
          lead_count?: number;
          lead_ids?: string[] | null;
          campaign_id?: string | null;
          from_agent_id: string;
          to_agent_id: string;
          transferred_by_tl_id: string;
          transfer_mode: "all" | "campaign" | "selected";
          transferred_at?: string;
          notes?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          lead_id?: string | null;
          lead_count?: number;
          lead_ids?: string[] | null;
          campaign_id?: string | null;
          from_agent_id?: string;
          to_agent_id?: string;
          transferred_by_tl_id?: string;
          transfer_mode?: "all" | "campaign" | "selected";
          transferred_at?: string;
          notes?: string | null;
        };
      };
      consent_records: {
        Row: {
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
        };
        Insert: {
          id?: string;
          lead_id: string;
          campaign_id: string;
          consent_given_at?: string | null;
          consent_method?: string | null;
          ip_address?: string | null;
          recording_url?: string | null;
          consent_text?: string | null;
          sha256_hash?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          campaign_id?: string;
          consent_given_at?: string | null;
          consent_method?: string | null;
          ip_address?: string | null;
          recording_url?: string | null;
          consent_text?: string | null;
          sha256_hash?: string | null;
          created_at?: string;
        };
      };
      campaign_logs: {
        Row: {
          id: string;
          campaign_id: string;
          action: string;
          message: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          action: string;
          message: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          action?: string;
          message?: string;
          created_by?: string;
          created_at?: string;
        };
      };
      alerts: {
        Row: {
          id: string;
          organization_id: string;
          campaign_id: string | null;
          lead_id: string | null;
          alert_type: string;
          severity: "low" | "medium" | "high" | "critical";
          title: string;
          message: string | null;
          metadata: Json | null;
          is_resolved: boolean;
          resolved_by: string | null;
          resolved_at: string | null;
          resolution_note: string | null;
          resolution_category: string | null;
          display_id: number;
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          campaign_id?: string | null;
          lead_id?: string | null;
          alert_type: string;
          severity?: "low" | "medium" | "high" | "critical";
          title: string;
          message?: string | null;
          metadata?: Json | null;
          is_resolved?: boolean;
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
          resolution_category?: string | null;
          display_id?: number;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          campaign_id?: string | null;
          lead_id?: string | null;
          alert_type?: string;
          severity?: "low" | "medium" | "high" | "critical";
          title?: string;
          message?: string | null;
          metadata?: Json | null;
          is_resolved?: boolean;
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
          resolution_category?: string | null;
          display_id?: number;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      agent_create_campaign_lead: {
        Args: { p_campaign_id: string; p_payload: Json };
        Returns: Json;
      };
      agent_import_campaign_leads: {
        Args: { p_campaign_id: string; p_rows: Json };
        Returns: Json;
      };
      agent_update_campaign_lead: {
        Args: { p_campaign_id: string; p_lead_id: string; p_payload: Json };
        Returns: Json;
      };
      get_my_organization_id: { Args: Record<string, never>; Returns: string };
      is_org_admin: { Args: { check_user_id?: string }; Returns: boolean };
      lead_duplicate_audit_report: {
        Args: { p_organization_id?: string | null; p_campaign_id?: string | null };
        Returns: {
          campaign_id: string;
          campaign_name: string;
          lead_db_id: string;
          lead_id: string;
          agent_name: string;
          creation_time: string;
          duplicate_reason: string;
          recommended_original_row_to_keep: string;
          extra_rows_requiring_review: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
