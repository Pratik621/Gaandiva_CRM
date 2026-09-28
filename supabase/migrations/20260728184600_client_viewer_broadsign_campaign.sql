-- Add Broadsign Pilot campaign to kstagnito2@rh-hub.com client_viewer allowlist.

CREATE OR REPLACE FUNCTION public.client_viewer_email_campaign_override_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ARRAY[
    '4562aeae-e14b-4c24-b6c5-c63c9d9e8bbb'::uuid,
    '92e6bc07-b9f8-49e0-829b-fe39c6ac5f72'::uuid,
    '06038f73-3764-4300-a6c8-81a157674a65'::uuid
  ];
$$;
