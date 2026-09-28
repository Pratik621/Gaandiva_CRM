-- Fierce Biotech Landing Page: Total Users 349 (related metrics scaled)

UPDATE public.campaign_performance_reports
SET
  landing_page_data = jsonb_build_object(
    'savedAt', '2026-07-30T17:50:00.000Z',
    'formData', jsonb_build_object(
      'totalUsers', '349',
      'avgSession', '2.6',
      'bouncedUsers', '71',
      'formDownloads', '51',
      'bounceRate', '20.3'
    ),
    'stateEntries', jsonb_build_array(
      jsonb_build_object('id', 'st1', 'state', 'California', 'value', '78'),
      jsonb_build_object('id', 'st2', 'state', 'New Jersey', 'value', '61'),
      jsonb_build_object('id', 'st3', 'state', 'Massachusetts', 'value', '52'),
      jsonb_build_object('id', 'st4', 'state', 'Texas', 'value', '43'),
      jsonb_build_object('id', 'st5', 'state', 'Pennsylvania', 'value', '35'),
      jsonb_build_object('id', 'st6', 'state', 'Illinois', 'value', '30'),
      jsonb_build_object('id', 'st7', 'state', 'New York', 'value', '28'),
      jsonb_build_object('id', 'st8', 'state', 'North Carolina', 'value', '22')
    )
  ),
  updated_at = NOW()
WHERE crm_campaign_uuid = '4562aeae-e14b-4c24-b6c5-c63c9d9e8bbb';
