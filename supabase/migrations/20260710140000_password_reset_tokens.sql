-- Password reset tokens (Resend delivery; hashed; one-time)
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
  ON public.password_reset_tokens (token_hash)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON public.password_reset_tokens (user_id, created_at DESC);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.password_reset_tokens TO service_role;
