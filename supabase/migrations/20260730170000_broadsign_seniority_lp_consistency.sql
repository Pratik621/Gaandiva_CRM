-- Broadsign report consistency:
-- Job / Open / Click seniority counts must sum exactly to their section totals
-- (Total Sent 7,948 / Total ECs Opened 743 / Total ECs Clicked 225).
-- Landing Page: 200 users, 80 bounced, 66 downloads, 40.0% bounce.

UPDATE public.campaign_performance_reports
SET
  outbound_data = jsonb_set(
    outbound_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 's1', 'value', '1120', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 's2', 'value', '1999', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 's3', 'value', '3512', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 's4', 'value', '1317', 'scenario', 'Manager', 'seniority', 'Manager')
    )
  ),
  poc_opens_data = jsonb_set(
    poc_opens_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 'os1', 'value', '107', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 'os2', 'value', '188', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 'os3', 'value', '333', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 'os4', 'value', '115', 'scenario', 'Manager', 'seniority', 'Manager')
    )
  ),
  poc_clicks_data = jsonb_set(
    poc_clicks_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 'cs1', 'value', '33', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 'cs2', 'value', '58', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 'cs3', 'value', '100', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 'cs4', 'value', '34', 'scenario', 'Manager', 'seniority', 'Manager')
    )
  ),
  landing_page_data = jsonb_build_object(
    'savedAt', '2026-07-30T17:00:00.000Z',
    'formData', jsonb_build_object(
      'totalUsers', '200',
      'avgSession', '2.8',
      'bouncedUsers', '80',
      'formDownloads', '66',
      'bounceRate', '40.0'
    ),
    'stateEntries', jsonb_build_array(
      jsonb_build_object('id', 'st1', 'state', 'California', 'value', '42'),
      jsonb_build_object('id', 'st2', 'state', 'Texas', 'value', '36'),
      jsonb_build_object('id', 'st3', 'state', 'New York', 'value', '29'),
      jsonb_build_object('id', 'st4', 'state', 'Florida', 'value', '24'),
      jsonb_build_object('id', 'st5', 'state', 'Illinois', 'value', '21'),
      jsonb_build_object('id', 'st6', 'state', 'Ohio', 'value', '18'),
      jsonb_build_object('id', 'st7', 'state', 'Georgia', 'value', '16'),
      jsonb_build_object('id', 'st8', 'state', 'Pennsylvania', 'value', '14')
    )
  ),
  updated_at = NOW()
WHERE crm_campaign_uuid = '06038f73-3764-4300-a6c8-81a157674a65';
