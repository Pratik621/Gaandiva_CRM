-- Campaign files: store metadata for files uploaded to Supabase Storage
-- Storage path: campaign-files/{org_id}/{campaign_id}/{unique}_{filename}

CREATE TABLE public.campaign_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_files_campaign_id ON public.campaign_files(campaign_id);
CREATE INDEX idx_campaign_files_organization_id ON public.campaign_files(organization_id);

ALTER TABLE public.campaign_files ENABLE ROW LEVEL SECURITY;

-- Org members can read campaign files for their org
CREATE POLICY "campaign_files_select_org"
  ON public.campaign_files FOR SELECT TO authenticated
  USING (organization_id = public.get_my_organization_id());

-- TL, Admin, Sales can upload/delete
CREATE POLICY "campaign_files_insert_tl_admin_sales"
  ON public.campaign_files FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  );

CREATE POLICY "campaign_files_delete_tl_admin_sales"
  ON public.campaign_files FOR DELETE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  );

-- Storage bucket and RLS (run only if storage schema exists, e.g. Supabase hosted)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('campaign-files', 'campaign-files', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaign_files_storage_select') THEN
      CREATE POLICY "campaign_files_storage_select"
        ON storage.objects FOR SELECT TO authenticated
        USING (
          bucket_id = 'campaign-files'
          AND (storage.foldername(name))[1] = (SELECT public.get_my_organization_id()::text)
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaign_files_storage_insert') THEN
      CREATE POLICY "campaign_files_storage_insert"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'campaign-files'
          AND (storage.foldername(name))[1] = (SELECT public.get_my_organization_id()::text)
          AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaign_files_storage_delete') THEN
      CREATE POLICY "campaign_files_storage_delete"
        ON storage.objects FOR DELETE TO authenticated
        USING (
          bucket_id = 'campaign-files'
          AND (storage.foldername(name))[1] = (SELECT public.get_my_organization_id()::text)
          AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
        );
    END IF;
  END IF;
END $$;
