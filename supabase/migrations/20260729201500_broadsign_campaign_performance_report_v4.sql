-- Broadsign MQL Content Syndication campaign performance report from Broadsign_MQL_InStore_Media_Report_v4_new.docx

DELETE FROM public.campaign_performance_reports
WHERE crm_campaign_uuid = '06038f73-3764-4300-a6c8-81a157674a65';

INSERT INTO public.campaign_performance_reports (
  report_title,
  report_subtitle,
  start_date,
  end_date,
  soft_bounced,
  outbound_data,
  poc_opens_data,
  poc_clicks_data,
  landing_page_data,
  web_vitals_data,
  screenshot_data,
  is_outbound_saved,
  is_poc_opens_saved,
  is_poc_clicks_saved,
  is_landing_page_saved,
  is_web_vitals_saved,
  status,
  crm_campaign_uuid,
  crm_campaign_id,
  crm_campaign_name,
  crm_campaign_code,
  crm_client_name
) VALUES (
  'Campaign Performance Report — Sham S',
  'Broadsign – MQL Content Syndication · From Screens to Sales: How Retailers Can Unlock the Power of In-Store Media',
  '2026-05-04',
  '2026-05-22',
  '28',
  jsonb_build_object(
    'savedAt', '2026-07-29T20:15:00.000Z',
    'softBounced', '28',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'Broadsign – MQL Content Syndication · From Screens to Sales: How Retailers Can Unlock the Power of In-Store Media',
      'startDate', '2026-05-04',
      'endDate', '2026-05-22',
      'totalEmailsSent', '7948',
      'totalEmailsDelivered', '7551',
      'dailyAvgSends', '530',
      'totalHardBounced', '146',
      'bounceRate', '1.84'
    ),
    'pacingEntries', jsonb_build_array(
      jsonb_build_object('id', 'p1', 'date', 'May 04', 'value', '385'),
      jsonb_build_object('id', 'p2', 'date', 'May 05', 'value', '413'),
      jsonb_build_object('id', 'p3', 'date', 'May 06', 'value', '441'),
      jsonb_build_object('id', 'p4', 'date', 'May 07', 'value', '468'),
      jsonb_build_object('id', 'p5', 'date', 'May 08', 'value', '496'),
      jsonb_build_object('id', 'p6', 'date', 'May 11', 'value', '516'),
      jsonb_build_object('id', 'p7', 'date', 'May 12', 'value', '535'),
      jsonb_build_object('id', 'p8', 'date', 'May 13', 'value', '554'),
      jsonb_build_object('id', 'p9', 'date', 'May 14', 'value', '574'),
      jsonb_build_object('id', 'p10', 'date', 'May 15', 'value', '594'),
      jsonb_build_object('id', 'p11', 'date', 'May 18', 'value', '546'),
      jsonb_build_object('id', 'p12', 'date', 'May 19', 'value', '566'),
      jsonb_build_object('id', 'p13', 'date', 'May 20', 'value', '586'),
      jsonb_build_object('id', 'p14', 'date', 'May 21', 'value', '606'),
      jsonb_build_object('id', 'p15', 'date', 'May 22', 'value', '668')
    ),
    'jobRoleEntries', jsonb_build_array(
      jsonb_build_object('id', 'r1', 'role', 'Information Technology', 'value', '32'),
      jsonb_build_object('id', 'r2', 'role', 'Marketing', 'value', '24'),
      jsonb_build_object('id', 'r3', 'role', 'Data Analytics', 'value', '19'),
      jsonb_build_object('id', 'r4', 'role', 'Retail Media Leadership', 'value', '15'),
      jsonb_build_object('id', 'r5', 'role', 'Digital Ad Operations', 'value', '10')
    ),
    'jobScenarioEntries', jsonb_build_array(
      jsonb_build_object('id', 's1', 'value', '74', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 's2', 'value', '132', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 's3', 'value', '232', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 's4', 'value', '87', 'scenario', 'Manager', 'seniority', 'Manager')
    ),
    'selectedCampaign', jsonb_build_object(
      'id', '06038f73-3764-4300-a6c8-81a157674a65',
      'name', 'Broadsign Pilot - MQL Content Syndication',
      'status', 'completed',
      'campaign_id', 'CMP-RNHHUB-BROADSIGNPILOTMQLCONTENT-2026-0511-SSFX',
      'client_name', null,
      'campaign_code', 'BSN-MQL-2026'
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T20:15:00.000Z',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'Broadsign – MQL Content Syndication · From Screens to Sales: How Retailers Can Unlock the Power of In-Store Media',
      'totalECsOpened', '743',
      'ecOpenRatio', '9.84'
    ),
    'barEntries', jsonb_build_array(
      jsonb_build_object('id', 'o1', 'date', 'May 04', 'value', '35'),
      jsonb_build_object('id', 'o2', 'date', 'May 05', 'value', '38'),
      jsonb_build_object('id', 'o3', 'date', 'May 06', 'value', '41'),
      jsonb_build_object('id', 'o4', 'date', 'May 07', 'value', '43'),
      jsonb_build_object('id', 'o5', 'date', 'May 08', 'value', '46'),
      jsonb_build_object('id', 'o6', 'date', 'May 11', 'value', '48'),
      jsonb_build_object('id', 'o7', 'date', 'May 12', 'value', '50'),
      jsonb_build_object('id', 'o8', 'date', 'May 13', 'value', '52'),
      jsonb_build_object('id', 'o9', 'date', 'May 14', 'value', '55'),
      jsonb_build_object('id', 'o10', 'date', 'May 15', 'value', '57'),
      jsonb_build_object('id', 'o11', 'date', 'May 18', 'value', '52'),
      jsonb_build_object('id', 'o12', 'date', 'May 19', 'value', '54'),
      jsonb_build_object('id', 'o13', 'date', 'May 20', 'value', '56'),
      jsonb_build_object('id', 'o14', 'date', 'May 21', 'value', '58'),
      jsonb_build_object('id', 'o15', 'date', 'May 22', 'value', '58')
    ),
    'jobRoleEntries', jsonb_build_array(
      jsonb_build_object('id', 'or1', 'role', 'Information Technology', 'value', '34'),
      jsonb_build_object('id', 'or2', 'role', 'Marketing', 'value', '25'),
      jsonb_build_object('id', 'or3', 'role', 'Data Analytics', 'value', '20'),
      jsonb_build_object('id', 'or4', 'role', 'Retail Media Leadership', 'value', '13'),
      jsonb_build_object('id', 'or5', 'role', 'Digital Ad Operations', 'value', '8')
    ),
    'jobScenarioEntries', jsonb_build_array(
      jsonb_build_object('id', 'os1', 'value', '70', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 'os2', 'value', '123', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 'os3', 'value', '217', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 'os4', 'value', '75', 'scenario', 'Manager', 'seniority', 'Manager')
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T20:15:00.000Z',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'Broadsign – MQL Content Syndication · From Screens to Sales: How Retailers Can Unlock the Power of In-Store Media',
      'totalECsClicked', '225',
      'ecClickRatio', '2.98'
    ),
    'barEntries', jsonb_build_array(
      jsonb_build_object('id', 'c1', 'date', 'May 04', 'value', '10'),
      jsonb_build_object('id', 'c2', 'date', 'May 05', 'value', '11'),
      jsonb_build_object('id', 'c3', 'date', 'May 06', 'value', '12'),
      jsonb_build_object('id', 'c4', 'date', 'May 07', 'value', '13'),
      jsonb_build_object('id', 'c5', 'date', 'May 08', 'value', '14'),
      jsonb_build_object('id', 'c6', 'date', 'May 11', 'value', '15'),
      jsonb_build_object('id', 'c7', 'date', 'May 12', 'value', '15'),
      jsonb_build_object('id', 'c8', 'date', 'May 13', 'value', '16'),
      jsonb_build_object('id', 'c9', 'date', 'May 14', 'value', '17'),
      jsonb_build_object('id', 'c10', 'date', 'May 15', 'value', '18'),
      jsonb_build_object('id', 'c11', 'date', 'May 18', 'value', '15'),
      jsonb_build_object('id', 'c12', 'date', 'May 19', 'value', '16'),
      jsonb_build_object('id', 'c13', 'date', 'May 20', 'value', '17'),
      jsonb_build_object('id', 'c14', 'date', 'May 21', 'value', '18'),
      jsonb_build_object('id', 'c15', 'date', 'May 22', 'value', '18')
    ),
    'jobRoleEntries', jsonb_build_array(
      jsonb_build_object('id', 'cr1', 'role', 'Information Technology', 'value', '35'),
      jsonb_build_object('id', 'cr2', 'role', 'Marketing', 'value', '26'),
      jsonb_build_object('id', 'cr3', 'role', 'Data Analytics', 'value', '19'),
      jsonb_build_object('id', 'cr4', 'role', 'Retail Media Leadership', 'value', '13'),
      jsonb_build_object('id', 'cr5', 'role', 'Digital Ad Operations', 'value', '7')
    ),
    'jobScenarioEntries', jsonb_build_array(
      jsonb_build_object('id', 'cs1', 'value', '23', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 'cs2', 'value', '41', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 'cs3', 'value', '70', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 'cs4', 'value', '24', 'scenario', 'Manager', 'seniority', 'Manager')
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T20:15:00.000Z',
    'formData', jsonb_build_object(
      'totalUsers', '449',
      'avgSession', '2.8',
      'bouncedUsers', '87',
      'formDownloads', '66',
      'bounceRate', '19.4'
    ),
    'stateEntries', jsonb_build_array(
      jsonb_build_object('id', 'st1', 'state', 'California', 'value', '89'),
      jsonb_build_object('id', 'st2', 'state', 'Texas', 'value', '76'),
      jsonb_build_object('id', 'st3', 'state', 'New York', 'value', '63'),
      jsonb_build_object('id', 'st4', 'state', 'Florida', 'value', '52'),
      jsonb_build_object('id', 'st5', 'state', 'Illinois', 'value', '45'),
      jsonb_build_object('id', 'st6', 'state', 'Ohio', 'value', '38'),
      jsonb_build_object('id', 'st7', 'state', 'Georgia', 'value', '35'),
      jsonb_build_object('id', 'st8', 'state', 'Pennsylvania', 'value', '30')
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T20:15:00.000Z',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'Broadsign – MQL Content Syndication · From Screens to Sales: How Retailers Can Unlock the Power of In-Store Media',
      'avgPageLoadSpeed', '1.72',
      'structureMetrix', '94',
      'largestElementLCP', '1.98',
      'tbtScriptBlocks', '106',
      'tbt', '106',
      'firstContentfulPaint', '0.84',
      'timeToInteractive', '2.4',
      'largestContentfulPaint', '1.98',
      'fullyLoadedTime', '3.5'
    ),
    'speedEntries', jsonb_build_array(
      jsonb_build_object('id', 'sp1', 'value', '1.54'),
      jsonb_build_object('id', 'sp2', 'value', '1.78'),
      jsonb_build_object('id', 'sp3', 'value', '1.65'),
      jsonb_build_object('id', 'sp4', 'value', '1.86'),
      jsonb_build_object('id', 'sp5', 'value', '1.71'),
      jsonb_build_object('id', 'sp6', 'value', '1.79')
    )
  ),
  '/Broadsign_camapign.png',
  true,
  true,
  true,
  true,
  true,
  'completed',
  '06038f73-3764-4300-a6c8-81a157674a65',
  'CMP-RNHHUB-BROADSIGNPILOTMQLCONTENT-2026-0511-SSFX',
  'Broadsign Pilot - MQL Content Syndication',
  'BSN-MQL-2026',
  NULL
);
