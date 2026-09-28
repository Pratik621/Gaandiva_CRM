-- Backward compatibility for app builds that still SELECT campaigns.region
-- after region was merged into geography. Read-only alias; do not write to this column.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS region text GENERATED ALWAYS AS (geography) STORED;

COMMENT ON COLUMN public.campaigns.region IS
  'Deprecated generated alias of geography for older app builds. Safe to drop after geography-only APIs are deployed everywhere.';
