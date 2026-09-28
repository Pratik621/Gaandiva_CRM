ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS campaign_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'campaigns_campaign_type_check'
  ) THEN
    ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_campaign_type_check
    CHECK (
      campaign_type IS NULL
      OR campaign_type IN ('Email CS', 'Email CS DT', 'Webinar')
    );
  END IF;
END $$;

COMMENT ON COLUMN public.campaigns.campaign_type IS
'Campaign type selected in Create New Campaign (Email CS, Email CS DT, Webinar).';
