-- Align campaign start/end dates with campaign_performance_reports for client_viewer allowlist campaigns.

UPDATE public.campaigns
SET
  start_date = '2026-07-01',
  end_date = '2026-07-28',
  updated_at = NOW()
WHERE id = '4562aeae-e14b-4c24-b6c5-c63c9d9e8bbb';

UPDATE public.campaigns
SET
  start_date = '2026-06-03',
  end_date = '2026-06-22',
  updated_at = NOW()
WHERE id = '92e6bc07-b9f8-49e0-829b-fe39c6ac5f72';

UPDATE public.campaigns
SET
  start_date = '2026-05-04',
  end_date = '2026-05-22',
  updated_at = NOW()
WHERE id = '06038f73-3764-4300-a6c8-81a157674a65';
