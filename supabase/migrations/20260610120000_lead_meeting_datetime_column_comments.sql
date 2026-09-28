-- Document renamed user-facing labels for scored / appointment datetime fields.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS scored_timezone text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS appointment_timezone text;

COMMENT ON COLUMN public.leads.scored IS 'Date Meeting Set Date & Time (UTC timestamptz)';
COMMENT ON COLUMN public.leads.scored_timezone IS 'Date Meeting Set Time Zone (IANA)';
COMMENT ON COLUMN public.leads.appointment IS 'Meeting Date & Time (UTC timestamptz)';
COMMENT ON COLUMN public.leads.appointment_timezone IS 'Meeting Date & Time Zone (IANA)';
