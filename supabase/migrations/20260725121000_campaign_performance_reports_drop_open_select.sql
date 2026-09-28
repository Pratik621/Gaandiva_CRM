-- Follow-up: drop open SELECT-all; restore write grants for external Campaign Report Generator.
-- Companion to 20260725120000_campaign_performance_reports_client_select_rls.sql

DROP POLICY IF EXISTS "campaign_performance_reports_select_all" ON public.campaign_performance_reports;

GRANT INSERT, UPDATE, DELETE ON TABLE public.campaign_performance_reports TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.campaign_performance_reports TO authenticated;
