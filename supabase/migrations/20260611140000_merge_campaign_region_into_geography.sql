-- Region was a duplicate of Geography on campaigns. Merge existing data and drop Region.

UPDATE public.campaigns
SET geography = TRIM(region)
WHERE region IS NOT NULL
  AND TRIM(region) <> ''
  AND (geography IS NULL OR TRIM(geography) = '');

COMMENT ON COLUMN public.campaigns.geography IS 'Target geography / region for the campaign (e.g. North America, APAC, EMEA).';

ALTER TABLE public.campaigns DROP COLUMN IF EXISTS region;
