-- Command Center: sequential alert display id, acknowledgement, resolution category

CREATE SEQUENCE IF NOT EXISTS public.alerts_display_id_seq;

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS display_id bigint,
  ADD COLUMN IF NOT EXISTS resolution_category text,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES public.users(id);

UPDATE public.alerts AS a
SET display_id = s.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM public.alerts
  WHERE display_id IS NULL
) AS s
WHERE a.id = s.id;

-- Empty table: nextval must return 1 → setval(..., 1, false).
-- With rows: advance past MAX(display_id) → setval(..., max, true).
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM public.alerts) THEN
    setval(
      'public.alerts_display_id_seq',
      (SELECT MAX(display_id) FROM public.alerts),
      true
    )
  ELSE
    setval('public.alerts_display_id_seq', 1, false)
END;

ALTER TABLE public.alerts
  ALTER COLUMN display_id SET DEFAULT nextval('public.alerts_display_id_seq');

ALTER TABLE public.alerts
  ALTER COLUMN display_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS alerts_display_id_unique ON public.alerts(display_id);
