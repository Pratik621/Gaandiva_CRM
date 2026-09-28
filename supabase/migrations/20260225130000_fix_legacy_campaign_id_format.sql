-- Fix campaigns that already have long CMP-LEGACY-{uuid} format → short CMP-CLIENTNAME-CAMPAIGNNAME-YYYY-MMDD-XXXX
-- Run this if you previously ran the add_campaign_id_unique migration and see long legacy IDs.

UPDATE public.campaigns
SET campaign_id =
  'CMP-'
  || CASE WHEN LENGTH(TRIM(UPPER(REGEXP_REPLACE(COALESCE(client_name, 'LEGACY'), '[^A-Za-z0-9]', '', 'gi')))) > 0
     THEN SUBSTRING(TRIM(UPPER(REGEXP_REPLACE(COALESCE(client_name, 'LEGACY'), '[^A-Za-z0-9]', '', 'gi'))), 1, 24)
     ELSE 'LEGACY' END
  || '-'
  || CASE WHEN LENGTH(TRIM(UPPER(REGEXP_REPLACE(COALESCE(name, 'CAMPAIGN'), '[^A-Za-z0-9]', '', 'gi')))) > 0
     THEN SUBSTRING(TRIM(UPPER(REGEXP_REPLACE(COALESCE(name, 'CAMPAIGN'), '[^A-Za-z0-9]', '', 'gi'))), 1, 24)
     ELSE 'CAMPAIGN' END
  || '-'
  || TO_CHAR(created_at, 'YYYY')
  || '-'
  || TO_CHAR(created_at, 'MMDD')
  || '-'
  || UPPER(SUBSTRING(MD5(id::text), 1, 4))
WHERE campaign_id LIKE 'CMP-LEGACY-%';
