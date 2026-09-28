-- Lifecycle stage is stored in lead_score as text (was integer for legacy "lead score" values).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_leads'
      AND column_name = 'lead_score'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE public.sales_leads
      ALTER COLUMN lead_score TYPE text USING (
        CASE WHEN lead_score IS NULL THEN NULL ELSE lead_score::text END
      );
  END IF;
END $$;
