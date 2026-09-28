-- Fierce Total Users 403; PMMI Total Users 393 (related LP metrics scaled)

UPDATE public.campaign_performance_reports
SET
  landing_page_data = jsonb_build_object(
    'savedAt', '2026-07-30T17:55:00.000Z',
    'formData', jsonb_build_object(
      'totalUsers', '403',
      'avgSession', '2.6',
      'bouncedUsers', '82',
      'formDownloads', '59',
      'bounceRate', '20.3'
    ),
    'stateEntries', jsonb_build_array(
      jsonb_build_object('id', 'st1', 'state', 'California', 'value', '90'),
      jsonb_build_object('id', 'st2', 'state', 'New Jersey', 'value', '71'),
      jsonb_build_object('id', 'st3', 'state', 'Massachusetts', 'value', '60'),
      jsonb_build_object('id', 'st4', 'state', 'Texas', 'value', '50'),
      jsonb_build_object('id', 'st5', 'state', 'Pennsylvania', 'value', '40'),
      jsonb_build_object('id', 'st6', 'state', 'Illinois', 'value', '35'),
      jsonb_build_object('id', 'st7', 'state', 'New York', 'value', '32'),
      jsonb_build_object('id', 'st8', 'state', 'North Carolina', 'value', '25')
    )
  ),
  updated_at = NOW()
WHERE crm_campaign_uuid = '4562aeae-e14b-4c24-b6c5-c63c9d9e8bbb';

UPDATE public.campaign_performance_reports
SET
  landing_page_data = jsonb_build_object(
    'savedAt', '2026-07-30T17:55:00.000Z',
    'formData', jsonb_build_object(
      'totalUsers', '393',
      'avgSession', '2.9',
      'bouncedUsers', '157',
      'formDownloads', '94',
      'bounceRate', '40.0'
    ),
    'stateEntries', jsonb_build_array(
      jsonb_build_object('id', 'st1', 'state', 'California', 'value', '82'),
      jsonb_build_object('id', 'st2', 'state', 'Texas', 'value', '67'),
      jsonb_build_object('id', 'st3', 'state', 'Illinois', 'value', '58'),
      jsonb_build_object('id', 'st4', 'state', 'Ohio', 'value', '47'),
      jsonb_build_object('id', 'st5', 'state', 'Pennsylvania', 'value', '42'),
      jsonb_build_object('id', 'st6', 'state', 'Michigan', 'value', '37'),
      jsonb_build_object('id', 'st7', 'state', 'Wisconsin', 'value', '32'),
      jsonb_build_object('id', 'st8', 'state', 'North Carolina', 'value', '28')
    )
  ),
  updated_at = NOW()
WHERE crm_campaign_uuid = '92e6bc07-b9f8-49e0-829b-fe39c6ac5f72';
