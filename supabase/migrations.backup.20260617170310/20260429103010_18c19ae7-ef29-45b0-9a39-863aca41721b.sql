-- Enum for the role a technician plays on a given ticket
DO $$ BEGIN
  CREATE TYPE public.intervention_role AS ENUM ('lead', 'aide', 'co_intervenant');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS role public.intervention_role NOT NULL DEFAULT 'lead';

CREATE INDEX IF NOT EXISTS idx_interventions_ticket_role
  ON public.interventions(ticket_id, role);

CREATE INDEX IF NOT EXISTS idx_interventions_technicien
  ON public.interventions(technicien_id);

-- Backfill: interventions whose technicien matches the ticket assignee stay 'lead' (default),
-- everyone else becomes 'aide'. New collaborator inserts will carry the precise role.
UPDATE public.interventions i
SET role = 'aide'
FROM public.tickets t
WHERE i.ticket_id = t.id
  AND t.assignee_id IS NOT NULL
  AND i.technicien_id <> t.assignee_id;