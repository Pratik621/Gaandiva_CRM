ALTER TABLE public.campaigns
DROP CONSTRAINT IF EXISTS campaigns_campaign_type_check;

UPDATE public.campaigns
SET campaign_type = 'Webinar/Live Events'
WHERE campaign_type = 'Webinar';

ALTER TABLE public.campaigns
ADD CONSTRAINT campaigns_campaign_type_check
CHECK (
  campaign_type IS NULL
  OR campaign_type IN (
    'Email CS',
    'Email CS DT',
    'Webinar/Live Events',
    'HQL',
    'BANT',
    'BANT-CCL',
    'AG'
  )
);

COMMENT ON COLUMN public.campaigns.campaign_type IS
'Campaign type selected in Create New Campaign (Email CS, Email CS DT, Webinar/Live Events, HQL, BANT, BANT-CCL, AG).';
