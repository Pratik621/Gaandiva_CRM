-- Fierce + PMMI: seniority counts must sum exactly to section totals
-- (same consistency logic as Broadsign).

-- Fierce Biotech – BIO Preview 2026
-- Total Sent 16,200 / Opens 1,412 / Clicks 444
UPDATE public.campaign_performance_reports
SET
  outbound_data = jsonb_set(
    outbound_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 's1', 'value', '1746', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 's2', 'value', '2735', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 's3', 'value', '4446', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 's4', 'value', '4864', 'scenario', 'Manager', 'seniority', 'Manager'),
      jsonb_build_object('id', 's5', 'value', '2409', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    )
  ),
  poc_opens_data = jsonb_set(
    poc_opens_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 'os1', 'value', '142', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 'os2', 'value', '205', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 'os3', 'value', '376', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 'os4', 'value', '418', 'scenario', 'Manager', 'seniority', 'Manager'),
      jsonb_build_object('id', 'os5', 'value', '271', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    )
  ),
  poc_clicks_data = jsonb_set(
    poc_clicks_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 'cs1', 'value', '45', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 'cs2', 'value', '71', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 'cs3', 'value', '118', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 'cs4', 'value', '129', 'scenario', 'Manager', 'seniority', 'Manager'),
      jsonb_build_object('id', 'cs5', 'value', '81', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    )
  ),
  updated_at = NOW()
WHERE crm_campaign_uuid = '4562aeae-e14b-4c24-b6c5-c63c9d9e8bbb';

-- PMMI Media Group – Columbia Machine
-- Total Sent 18,357 / Opens 1,583 / Clicks 497
UPDATE public.campaign_performance_reports
SET
  outbound_data = jsonb_set(
    outbound_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 's1', 'value', '2971', 'scenario', 'C-Level / Executive / Gen Mgr', 'seniority', 'C-Level / Executive / Gen Mgr'),
      jsonb_build_object('id', 's2', 'value', '4669', 'scenario', 'VP / SVP / Director', 'seniority', 'VP / SVP / Director'),
      jsonb_build_object('id', 's3', 'value', '7337', 'scenario', 'Manager / Plant Manager', 'seniority', 'Manager / Plant Manager'),
      jsonb_build_object('id', 's4', 'value', '3380', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    )
  ),
  poc_opens_data = jsonb_set(
    poc_opens_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 'os1', 'value', '257', 'scenario', 'C-Level / Executive / Gen Mgr', 'seniority', 'C-Level / Executive / Gen Mgr'),
      jsonb_build_object('id', 'os2', 'value', '404', 'scenario', 'VP / SVP / Director', 'seniority', 'VP / SVP / Director'),
      jsonb_build_object('id', 'os3', 'value', '631', 'scenario', 'Manager / Plant Manager', 'seniority', 'Manager / Plant Manager'),
      jsonb_build_object('id', 'os4', 'value', '291', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    )
  ),
  poc_clicks_data = jsonb_set(
    poc_clicks_data,
    '{jobScenarioEntries}',
    jsonb_build_array(
      jsonb_build_object('id', 'cs1', 'value', '80', 'scenario', 'C-Level / Executive / Gen Mgr', 'seniority', 'C-Level / Executive / Gen Mgr'),
      jsonb_build_object('id', 'cs2', 'value', '129', 'scenario', 'VP / SVP / Director', 'seniority', 'VP / SVP / Director'),
      jsonb_build_object('id', 'cs3', 'value', '197', 'scenario', 'Manager / Plant Manager', 'seniority', 'Manager / Plant Manager'),
      jsonb_build_object('id', 'cs4', 'value', '91', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    )
  ),
  updated_at = NOW()
WHERE crm_campaign_uuid = '92e6bc07-b9f8-49e0-829b-fe39c6ac5f72';
