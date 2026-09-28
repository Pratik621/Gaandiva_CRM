-- Fierce Biotech BIO Preview 2026 campaign performance report from Fierce_Biotech_BIO_Preview_2026_v3.docx

DELETE FROM public.campaign_performance_reports
WHERE crm_campaign_uuid = '4562aeae-e14b-4c24-b6c5-c63c9d9e8bbb';

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
  'Fierce Biotech – BIO Preview 2026 · Live Webinar RSVP · Email Form Fill',
  '2026-07-01',
  '2026-07-28',
  '58',
  jsonb_build_object(
    'savedAt', '2026-07-29T18:30:00.000Z',
    'softBounced', '58',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'Fierce Biotech – BIO Preview 2026 · Live Webinar RSVP · Email Form Fill',
      'startDate', '2026-07-01',
      'endDate', '2026-07-28',
      'totalEmailsSent', '16200',
      'totalEmailsDelivered', '15390',
      'dailyAvgSends', '579',
      'totalHardBounced', '296',
      'bounceRate', '1.83',
      'ecManagers', '59',
      'ecDirectors', '41'
    ),
    'pacingEntries', jsonb_build_array(
      jsonb_build_object('id', 'p1', 'date', 'Jul 01', 'value', '320'),
      jsonb_build_object('id', 'p2', 'date', 'Jul 04', 'value', '385'),
      jsonb_build_object('id', 'p3', 'date', 'Jul 08', 'value', '470'),
      jsonb_build_object('id', 'p4', 'date', 'Jul 11', 'value', '525'),
      jsonb_build_object('id', 'p5', 'date', 'Jul 15', 'value', '610'),
      jsonb_build_object('id', 'p6', 'date', 'Jul 18', 'value', '680'),
      jsonb_build_object('id', 'p7', 'date', 'Jul 22', 'value', '645'),
      jsonb_build_object('id', 'p8', 'date', 'Jul 25', 'value', '745')
    ),
    'jobRoleEntries', jsonb_build_array(
      jsonb_build_object('id', 'r1', 'role', 'R&D', 'value', '26'),
      jsonb_build_object('id', 'r2', 'role', 'Clinical Operations', 'value', '21'),
      jsonb_build_object('id', 'r3', 'role', 'Manufacturing', 'value', '18'),
      jsonb_build_object('id', 'r4', 'role', 'Process Development', 'value', '15'),
      jsonb_build_object('id', 'r5', 'role', 'Regulatory Affairs', 'value', '12'),
      jsonb_build_object('id', 'r6', 'role', 'Compliance', 'value', '8')
    ),
    'jobScenarioEntries', jsonb_build_array(
      jsonb_build_object('id', 's1', 'value', '150', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 's2', 'value', '235', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 's3', 'value', '382', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 's4', 'value', '418', 'scenario', 'Manager', 'seniority', 'Manager'),
      jsonb_build_object('id', 's5', 'value', '207', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    ),
    'selectedCampaign', jsonb_build_object(
      'id', '4562aeae-e14b-4c24-b6c5-c63c9d9e8bbb',
      'name', 'Fierce Biotech – BIO Preview 2026',
      'status', 'completed',
      'campaign_id', 'CMP-7KNOTSDIGITALINC-FIERCEBIOTECHBIOPREVIEW2-2026-0612-RRX1',
      'client_name', '7 Knots Digital INC',
      'campaign_code', 'FB-BIO-2026'
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T18:30:00.000Z',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'Fierce Biotech – BIO Preview 2026 · Live Webinar RSVP · Email Form Fill',
      'totalECsOpened', '1412',
      'ecOpenRatio', '9.17'
    ),
    'barEntries', jsonb_build_array(
      jsonb_build_object('id', 'o1', 'date', 'Jul 01', 'value', '52'),
      jsonb_build_object('id', 'o2', 'date', 'Jul 04', 'value', '71'),
      jsonb_build_object('id', 'o3', 'date', 'Jul 08', 'value', '87'),
      jsonb_build_object('id', 'o4', 'date', 'Jul 11', 'value', '105'),
      jsonb_build_object('id', 'o5', 'date', 'Jul 15', 'value', '123'),
      jsonb_build_object('id', 'o6', 'date', 'Jul 18', 'value', '140'),
      jsonb_build_object('id', 'o7', 'date', 'Jul 22', 'value', '130'),
      jsonb_build_object('id', 'o8', 'date', 'Jul 25', 'value', '154')
    ),
    'jobRoleEntries', jsonb_build_array(
      jsonb_build_object('id', 'or1', 'role', 'R&D', 'value', '30'),
      jsonb_build_object('id', 'or2', 'role', 'Clinical Operations', 'value', '25'),
      jsonb_build_object('id', 'or3', 'role', 'Manufacturing', 'value', '17'),
      jsonb_build_object('id', 'or4', 'role', 'Process Development', 'value', '14'),
      jsonb_build_object('id', 'or5', 'role', 'Regulatory Affairs', 'value', '9'),
      jsonb_build_object('id', 'or6', 'role', 'Compliance', 'value', '5')
    ),
    'jobScenarioEntries', jsonb_build_array(
      jsonb_build_object('id', 'os1', 'value', '101', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 'os2', 'value', '146', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 'os3', 'value', '268', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 'os4', 'value', '298', 'scenario', 'Manager', 'seniority', 'Manager'),
      jsonb_build_object('id', 'os5', 'value', '193', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T18:30:00.000Z',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'Fierce Biotech – BIO Preview 2026 · Live Webinar RSVP · Email Form Fill',
      'totalECsClicked', '444',
      'ecClickRatio', '2.89'
    ),
    'barEntries', jsonb_build_array(
      jsonb_build_object('id', 'c1', 'date', 'Jul 01', 'value', '15'),
      jsonb_build_object('id', 'c2', 'date', 'Jul 04', 'value', '22'),
      jsonb_build_object('id', 'c3', 'date', 'Jul 08', 'value', '29'),
      jsonb_build_object('id', 'c4', 'date', 'Jul 11', 'value', '34'),
      jsonb_build_object('id', 'c5', 'date', 'Jul 15', 'value', '39'),
      jsonb_build_object('id', 'c6', 'date', 'Jul 18', 'value', '44'),
      jsonb_build_object('id', 'c7', 'date', 'Jul 22', 'value', '41'),
      jsonb_build_object('id', 'c8', 'date', 'Jul 25', 'value', '49')
    ),
    'jobRoleEntries', jsonb_build_array(
      jsonb_build_object('id', 'cr1', 'role', 'R&D', 'value', '33'),
      jsonb_build_object('id', 'cr2', 'role', 'Clinical Operations', 'value', '22'),
      jsonb_build_object('id', 'cr3', 'role', 'Manufacturing', 'value', '16'),
      jsonb_build_object('id', 'cr4', 'role', 'Process Development', 'value', '14'),
      jsonb_build_object('id', 'cr5', 'role', 'Regulatory Affairs', 'value', '10'),
      jsonb_build_object('id', 'cr6', 'role', 'Compliance', 'value', '5')
    ),
    'jobScenarioEntries', jsonb_build_array(
      jsonb_build_object('id', 'cs1', 'value', '35', 'scenario', 'C-Level / Executive', 'seniority', 'C-Level / Executive'),
      jsonb_build_object('id', 'cs2', 'value', '55', 'scenario', 'VP / SVP', 'seniority', 'VP / SVP'),
      jsonb_build_object('id', 'cs3', 'value', '91', 'scenario', 'Director', 'seniority', 'Director'),
      jsonb_build_object('id', 'cs4', 'value', '100', 'scenario', 'Manager', 'seniority', 'Manager'),
      jsonb_build_object('id', 'cs5', 'value', '63', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T18:30:00.000Z',
    'formData', jsonb_build_object(
      'totalUsers', '848',
      'avgSession', '2.6',
      'bouncedUsers', '172',
      'formDownloads', '124',
      'bounceRate', '20.3'
    ),
    'stateEntries', jsonb_build_array(
      jsonb_build_object('id', 'st1', 'state', 'California', 'value', '155'),
      jsonb_build_object('id', 'st2', 'state', 'New Jersey', 'value', '121'),
      jsonb_build_object('id', 'st3', 'state', 'Massachusetts', 'value', '103'),
      jsonb_build_object('id', 'st4', 'state', 'Texas', 'value', '86'),
      jsonb_build_object('id', 'st5', 'state', 'Pennsylvania', 'value', '71'),
      jsonb_build_object('id', 'st6', 'state', 'Illinois', 'value', '61'),
      jsonb_build_object('id', 'st7', 'state', 'New York', 'value', '56'),
      jsonb_build_object('id', 'st8', 'state', 'North Carolina', 'value', '45')
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T18:30:00.000Z',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'Fierce Biotech – BIO Preview 2026 · Live Webinar RSVP · Email Form Fill',
      'avgPageLoadSpeed', '1.69',
      'structureMetrix', '95',
      'largestElementLCP', '1.95',
      'tbtScriptBlocks', '104',
      'tbt', '104',
      'firstContentfulPaint', '0.82',
      'timeToInteractive', '2.3',
      'largestContentfulPaint', '1.95',
      'fullyLoadedTime', '3.4'
    ),
    'speedEntries', jsonb_build_array(
      jsonb_build_object('id', 'sp1', 'value', '1.52'),
      jsonb_build_object('id', 'sp2', 'value', '1.75'),
      jsonb_build_object('id', 'sp3', 'value', '1.63'),
      jsonb_build_object('id', 'sp4', 'value', '1.88'),
      jsonb_build_object('id', 'sp5', 'value', '1.70'),
      jsonb_build_object('id', 'sp6', 'value', '1.77')
    )
  ),
  '/fierce_bio-preview-2026.png',
  true,
  true,
  true,
  true,
  true,
  'completed',
  '4562aeae-e14b-4c24-b6c5-c63c9d9e8bbb',
  'CMP-7KNOTSDIGITALINC-FIERCEBIOTECHBIOPREVIEW2-2026-0612-RRX1',
  'Fierce Biotech – BIO Preview 2026',
  'FB-BIO-2026',
  NULL
);
