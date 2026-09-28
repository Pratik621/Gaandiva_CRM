-- InitPlan fixes for high-traffic RLS policies (notifications polling, login logs).
-- Replaces per-row auth.uid() evaluation with scalar subselect. Zero-downtime: DROP + CREATE in one txn.

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (receiver_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (receiver_id = (SELECT auth.uid()))
  WITH CHECK (receiver_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "login_logs_select_own" ON public.login_logs;
CREATE POLICY "login_logs_select_own"
  ON public.login_logs FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "login_logs_insert_own" ON public.login_logs;
CREATE POLICY "login_logs_insert_own"
  ON public.login_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
