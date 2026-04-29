-- Ensure quality controller role exists (idempotent)
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'controleur_qualite';
EXCEPTION WHEN others THEN NULL; END $$;