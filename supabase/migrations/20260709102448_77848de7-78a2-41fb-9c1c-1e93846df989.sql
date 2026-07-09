ALTER TABLE public.quality_shifts
  ADD COLUMN IF NOT EXISTS is_self_intervention boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intervention_reason text;