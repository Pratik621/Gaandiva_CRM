-- Broadsign report: remove Manager from all seniority breakdowns;
-- redistribute Manager counts proportionally across C-Level / VP / Director
-- so totals still equal Total Sent / Opens / Clicks.

UPDATE public.campaign_performance_reports
SET
  outbound_data = jsonb_set(
    outbound_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 's1', 'value', '1342', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 's2', 'value', '2396', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 's3', 'value', '4210', 'scenario', 'Director', 'seniority', 'Director')
    )
  ),
  poc_opens_data = jsonb_set(
    poc_opens_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 'os1', 'value', '127', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 'os2', 'value', '222', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 'os3', 'value', '394', 'scenario', 'Director', 'seniority', 'Director')
    )
  ),
  poc_clicks_data = jsonb_set(
    poc_clicks_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 'cs1', 'value', '39', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 'cs2', 'value', '68', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 'cs3', 'value', '118', 'scenario', 'Director', 'seniority', 'Director')
    )
  ),
  updated_at = NOW()
WHERE crm_campaign_uuid = '06038f73-3764-4300-a6c8-81a157674a65';
