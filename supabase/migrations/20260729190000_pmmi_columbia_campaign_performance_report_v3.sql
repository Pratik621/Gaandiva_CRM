-- PMMI Columbia Machine campaign performance report from PMMI_Columbia_Modular_EndOfLine_Report_v3.docx

DELETE FROM public.campaign_performance_reports
WHERE crm_campaign_uuid = '92e6bc07-b9f8-49e0-829b-fe39c6ac5f72';

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
  'PMMI Media Group – Columbia Machine, Inc. & Partners · The Rise of Modular End-of-Line Systems · Whitepaper / eBook Content Syndication',
  '2026-06-03',
  '2026-06-22',
  '66',
  jsonb_build_object(
    'savedAt', '2026-07-29T19:00:00.000Z',
    'softBounced', '66',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'PMMI Media Group – Columbia Machine, Inc. & Partners · The Rise of Modular End-of-Line Systems · Whitepaper / eBook Content Syndication',
      'startDate', '2026-06-03',
      'endDate', '2026-06-22',
      'totalEmailsSent', '18357',
      'totalEmailsDelivered', '17460',
      'dailyAvgSends', '918',
      'totalHardBounced', '338',
      'bounceRate', '1.84'
    ),
    'pacingEntries', jsonb_build_array(
      jsonb_build_object('id', 'p1', 'date', 'Jun 03', 'value', '382'),
      jsonb_build_object('id', 'p2', 'date', 'Jun 06', 'value', '457'),
      jsonb_build_object('id', 'p3', 'date', 'Jun 09', 'value', '530'),
      jsonb_build_object('id', 'p4', 'date', 'Jun 12', 'value', '607'),
      jsonb_build_object('id', 'p5', 'date', 'Jun 15', 'value', '675'),
      jsonb_build_object('id', 'p6', 'date', 'Jun 18', 'value', '753'),
      jsonb_build_object('id', 'p7', 'date', 'Jun 21', 'value', '714'),
      jsonb_build_object('id', 'p8', 'date', 'Jun 22', 'value', '777')
    ),
    'jobRoleEntries', jsonb_build_array(
      jsonb_build_object('id', 'r1', 'role', 'Production / Operations / Quality', 'value', '22'),
      jsonb_build_object('id', 'r2', 'role', 'Engineering', 'value', '18'),
      jsonb_build_object('id', 'r3', 'role', 'Plant Management', 'value', '15'),
      jsonb_build_object('id', 'r4', 'role', 'Senior Management / CEO / Gen Mgr', 'value', '13'),
      jsonb_build_object('id', 'r5', 'role', 'Logistics / Supply Chain Management', 'value', '11'),
      jsonb_build_object('id', 'r6', 'role', 'Package Design / Brand Management', 'value', '9'),
      jsonb_build_object('id', 'r7', 'role', 'Procurement', 'value', '6'),
      jsonb_build_object('id', 'r8', 'role', 'Validation / Compliance', 'value', '4'),
      jsonb_build_object('id', 'r9', 'role', 'Regulatory Affairs', 'value', '2')
    ),
    'jobScenarioEntries', jsonb_build_array(
      jsonb_build_object('id', 's1', 'value', '196', 'scenario', 'C-Level / Executive / Gen Mgr', 'seniority', 'C-Level / Executive / Gen Mgr'),
      jsonb_build_object('id', 's2', 'value', '308', 'scenario', 'VP / SVP / Director', 'seniority', 'VP / SVP / Director'),
      jsonb_build_object('id', 's3', 'value', '484', 'scenario', 'Manager / Plant Manager', 'seniority', 'Manager / Plant Manager'),
      jsonb_build_object('id', 's4', 'value', '223', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    ),
    'selectedCampaign', jsonb_build_object(
      'id', '92e6bc07-b9f8-49e0-829b-fe39c6ac5f72',
      'name', 'PMMI Media Group - Columbia Machine, Inc.; ROBOPAC / OCME / TopTier Palletizers; Formic; Brenton; Aagard',
      'status', 'completed',
      'campaign_id', 'CMP-7KNOTSDIGITALINC-PMMIMEDIAGROUPCOLUMBIAMA-2026-0604-Z4IF',
      'client_name', null,
      'campaign_code', 'PMMI-COL-2026'
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T19:00:00.000Z',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'PMMI Media Group – Columbia Machine, Inc. & Partners · The Rise of Modular End-of-Line Systems · Whitepaper / eBook Content Syndication',
      'totalECsOpened', '1583',
      'ecOpenRatio', '9.07'
    ),
    'barEntries', jsonb_build_array(
      jsonb_build_object('id', 'o1', 'date', 'Jun 03', 'value', '65'),
      jsonb_build_object('id', 'o2', 'date', 'Jun 06', 'value', '85'),
      jsonb_build_object('id', 'o3', 'date', 'Jun 09', 'value', '102'),
      jsonb_build_object('id', 'o4', 'date', 'Jun 12', 'value', '122'),
      jsonb_build_object('id', 'o5', 'date', 'Jun 15', 'value', '142'),
      jsonb_build_object('id', 'o6', 'date', 'Jun 18', 'value', '161'),
      jsonb_build_object('id', 'o7', 'date', 'Jun 21', 'value', '150'),
      jsonb_build_object('id', 'o8', 'date', 'Jun 22', 'value', '176')
    ),
    'jobRoleEntries', jsonb_build_array(
      jsonb_build_object('id', 'or1', 'role', 'Production / Operations / Quality', 'value', '24'),
      jsonb_build_object('id', 'or2', 'role', 'Engineering', 'value', '20'),
      jsonb_build_object('id', 'or3', 'role', 'Plant Management', 'value', '16'),
      jsonb_build_object('id', 'or4', 'role', 'Senior Management / CEO / Gen Mgr', 'value', '14'),
      jsonb_build_object('id', 'or5', 'role', 'Logistics / Supply Chain Management', 'value', '12'),
      jsonb_build_object('id', 'or6', 'role', 'Package Design / Brand Management', 'value', '8'),
      jsonb_build_object('id', 'or7', 'role', 'Procurement / Compliance / Regulatory', 'value', '6')
    ),
    'jobScenarioEntries', jsonb_build_array(
      jsonb_build_object('id', 'os1', 'value', '184', 'scenario', 'C-Level / Executive / Gen Mgr', 'seniority', 'C-Level / Executive / Gen Mgr'),
      jsonb_build_object('id', 'os2', 'value', '289', 'scenario', 'VP / SVP / Director', 'seniority', 'VP / SVP / Director'),
      jsonb_build_object('id', 'os3', 'value', '452', 'scenario', 'Manager / Plant Manager', 'seniority', 'Manager / Plant Manager'),
      jsonb_build_object('id', 'os4', 'value', '208', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T19:00:00.000Z',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'PMMI Media Group – Columbia Machine, Inc. & Partners · The Rise of Modular End-of-Line Systems · Whitepaper / eBook Content Syndication',
      'totalECsClicked', '497',
      'ecClickRatio', '2.85'
    ),
    'barEntries', jsonb_build_array(
      jsonb_build_object('id', 'c1', 'date', 'Jun 03', 'value', '19'),
      jsonb_build_object('id', 'c2', 'date', 'Jun 06', 'value', '27'),
      jsonb_build_object('id', 'c3', 'date', 'Jun 09', 'value', '34'),
      jsonb_build_object('id', 'c4', 'date', 'Jun 12', 'value', '40'),
      jsonb_build_object('id', 'c5', 'date', 'Jun 15', 'value', '47'),
      jsonb_build_object('id', 'c6', 'date', 'Jun 18', 'value', '53'),
      jsonb_build_object('id', 'c7', 'date', 'Jun 21', 'value', '49'),
      jsonb_build_object('id', 'c8', 'date', 'Jun 22', 'value', '57')
    ),
    'jobRoleEntries', jsonb_build_array(
      jsonb_build_object('id', 'cr1', 'role', 'Production / Operations / Quality', 'value', '26'),
      jsonb_build_object('id', 'cr2', 'role', 'Engineering', 'value', '21'),
      jsonb_build_object('id', 'cr3', 'role', 'Plant Management', 'value', '17'),
      jsonb_build_object('id', 'cr4', 'role', 'Senior Management / CEO / Gen Mgr', 'value', '13'),
      jsonb_build_object('id', 'cr5', 'role', 'Logistics / Supply Chain Management', 'value', '11'),
      jsonb_build_object('id', 'cr6', 'role', 'Package Design / Brand Management', 'value', '7'),
      jsonb_build_object('id', 'cr7', 'role', 'Procurement / Compliance / Regulatory', 'value', '5')
    ),
    'jobScenarioEntries', jsonb_build_array(
      jsonb_build_object('id', 'cs1', 'value', '47', 'scenario', 'C-Level / Executive / Gen Mgr', 'seniority', 'C-Level / Executive / Gen Mgr'),
      jsonb_build_object('id', 'cs2', 'value', '76', 'scenario', 'VP / SVP / Director', 'seniority', 'VP / SVP / Director'),
      jsonb_build_object('id', 'cs3', 'value', '116', 'scenario', 'Manager / Plant Manager', 'seniority', 'Manager / Plant Manager'),
      jsonb_build_object('id', 'cs4', 'value', '54', 'scenario', 'Individual Contributor', 'seniority', 'Individual Contributor')
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T19:00:00.000Z',
    'formData', jsonb_build_object(
      'totalUsers', '933',
      'avgSession', '2.9',
      'bouncedUsers', '188',
      'formDownloads', '138',
      'bounceRate', '20.2'
    ),
    'stateEntries', jsonb_build_array(
      jsonb_build_object('id', 'st1', 'state', 'California', 'value', '120'),
      jsonb_build_object('id', 'st2', 'state', 'Texas', 'value', '98'),
      jsonb_build_object('id', 'st3', 'state', 'Illinois', 'value', '84'),
      jsonb_build_object('id', 'st4', 'state', 'Ohio', 'value', '69'),
      jsonb_build_object('id', 'st5', 'state', 'Pennsylvania', 'value', '61'),
      jsonb_build_object('id', 'st6', 'state', 'Michigan', 'value', '54'),
      jsonb_build_object('id', 'st7', 'state', 'Wisconsin', 'value', '47'),
      jsonb_build_object('id', 'st8', 'state', 'North Carolina', 'value', '41')
    )
  ),
  jsonb_build_object(
    'savedAt', '2026-07-29T19:00:00.000Z',
    'formData', jsonb_build_object(
      'reportTitle', 'Campaign Performance Report — Sham S',
      'reportSubtitle', 'PMMI Media Group – Columbia Machine, Inc. & Partners · The Rise of Modular End-of-Line Systems · Whitepaper / eBook Content Syndication',
      'avgPageLoadSpeed', '1.78',
      'structureMetrix', '93',
      'largestElementLCP', '2.05',
      'tbtScriptBlocks', '112',
      'tbt', '112',
      'firstContentfulPaint', '0.88',
      'timeToInteractive', '2.5',
      'largestContentfulPaint', '2.05',
      'fullyLoadedTime', '3.7'
    ),
    'speedEntries', jsonb_build_array(
      jsonb_build_object('id', 'sp1', 'value', '1.58'),
      jsonb_build_object('id', 'sp2', 'value', '1.82'),
      jsonb_build_object('id', 'sp3', 'value', '1.67'),
      jsonb_build_object('id', 'sp4', 'value', '1.93'),
      jsonb_build_object('id', 'sp5', 'value', '1.74'),
      jsonb_build_object('id', 'sp6', 'value', '1.80')
    )
  ),
  '/PMMI Media Group.png',
  true,
  true,
  true,
  true,
  true,
  'completed',
  '92e6bc07-b9f8-49e0-829b-fe39c6ac5f72',
  'CMP-7KNOTSDIGITALINC-PMMIMEDIAGROUPCOLUMBIAMA-2026-0604-Z4IF',
  'PMMI Media Group - Columbia Machine, Inc.; ROBOPAC / OCME / TopTier Palletizers; Formic; Brenton; Aagard',
  'PMMI-COL-2026',
  NULL
);
