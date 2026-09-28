-- Profile fields for users: avatar, DOB, employee ID, joining date
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS joining_date date;

COMMENT ON COLUMN public.users.avatar_url IS 'Profile photo URL (Supabase Storage or external)';
COMMENT ON COLUMN public.users.employee_id IS 'Employee ID for display';
COMMENT ON COLUMN public.users.joining_date IS 'Date of joining the organization';

-- Avatars storage bucket (public read for profile photos)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('avatars', 'avatars', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Avatars storage RLS: users can upload/update/delete their own avatar
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'avatars_storage_select') THEN
      CREATE POLICY "avatars_storage_select"
        ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'avatars');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'avatars_storage_insert') THEN
      CREATE POLICY "avatars_storage_insert"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'avatars_storage_update') THEN
      CREATE POLICY "avatars_storage_update"
        ON storage.objects FOR UPDATE TO authenticated
        USING (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'avatars_storage_delete') THEN
      CREATE POLICY "avatars_storage_delete"
        ON storage.objects FOR DELETE TO authenticated
        USING (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text
        );
    END IF;
  END IF;
END $$;
