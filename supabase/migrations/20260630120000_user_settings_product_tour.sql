-- Per-user UI preferences (product tour state)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  product_tour_completed boolean NOT NULL DEFAULT false,
  product_tour_dismissed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_settings IS 'Per-user UI preferences; one row per user.';

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings_select_own" ON public.user_settings;
CREATE POLICY "user_settings_select_own"
  ON public.user_settings FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_settings_insert_own" ON public.user_settings;
CREATE POLICY "user_settings_insert_own"
  ON public.user_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_settings_update_own" ON public.user_settings;
CREATE POLICY "user_settings_update_own"
  ON public.user_settings FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
