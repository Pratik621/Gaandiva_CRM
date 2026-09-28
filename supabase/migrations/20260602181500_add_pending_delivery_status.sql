-- Allow tri-state delivery status and make pending the default.
UPDATE public.leads
SET delivery_status = 'pending'
WHERE delivery_status IS NULL;

ALTER TABLE public.leads
ALTER COLUMN delivery_status SET DEFAULT 'pending';

ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS leads_delivery_status_check;

ALTER TABLE public.leads
ADD CONSTRAINT leads_delivery_status_check
CHECK (delivery_status = ANY (ARRAY['pending'::text, 'not_delivered'::text, 'delivered'::text]));
