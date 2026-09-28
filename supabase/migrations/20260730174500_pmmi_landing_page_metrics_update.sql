-- PMMI Landing Page: 430 users, 172 bounced (40.0%), 103 form downloads

UPDATE public.campaign_performance_reports
SET
  landing_page_data = jsonb_build_object(
    'savedAt', '2026-07-30T17:45:00.000Z',
    'formData', jsonb_build_object(
      'totalUsers', '430',
      'avgSession', '2.9',
      'bouncedUsers', '172',
      'formDownloads', '103',
      'bounceRate', '40.0'
    ),
    'stateEntries', jsonb_build_array(
      jsonb_build_object('id', 'st1', 'state', 'California', 'value', '90'),
      jsonb_build_object('id', 'st2', 'state', 'Texas', 'value', '73'),
      jsonb_build_object('id', 'st3', 'state', 'Illinois', 'value', '63'),
      jsonb_build_object('id', 'st4', 'state', 'Ohio', 'value', '52'),
      jsonb_build_object('id', 'st5', 'state', 'Pennsylvania', 'value', '46'),
      jsonb_build_object('id', 'st6', 'state', 'Michigan', 'value', '40'),
      jsonb_build_object('id', 'st7', 'state', 'Wisconsin', 'value', '35'),
      jsonb_build_object('id', 'st8', 'state', 'North Carolina', 'value', '31')
    )
  ),
  updated_at = NOW()
WHERE crm_campaign_uuid = '92e6bc07-b9f8-49e0-829b-fe39c6ac5f72';
