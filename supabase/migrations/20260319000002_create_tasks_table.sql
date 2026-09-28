-- Tasks table for CRM task management
CREATE TABLE IF NOT EXISTS public.tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text        NOT NULL,
  description     text,
  related_type    text        CHECK (related_type IN ('lead', 'deal', 'contact')),
  related_id      uuid,
  due_date        timestamptz,
  priority        text        NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  assigned_to     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_organization  ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to   ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date      ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_priority      ON public.tasks(priority);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_tasks_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_tasks_updated_at();
