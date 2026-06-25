ALTER TABLE public.preventive_plans ADD COLUMN IF NOT EXISTS numero text;

CREATE OR REPLACE FUNCTION public.generate_preventive_plan_numero()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  mcode text;
  next_num integer;
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    SELECT code INTO mcode FROM public.machines WHERE id = NEW.machine_id;
    mcode := COALESCE(mcode, 'GEN');
    -- per-machine sequential number
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero FROM '[0-9]+$') AS integer)), 0) + 1
      INTO next_num
    FROM public.preventive_plans
    WHERE machine_id = NEW.machine_id
      AND numero LIKE mcode || '-PRV-%';
    NEW.numero := mcode || '-PRV-' || LPAD(next_num::text, 3, '0');
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_preventive_plan_numero ON public.preventive_plans;
CREATE TRIGGER trg_preventive_plan_numero
  BEFORE INSERT ON public.preventive_plans
  FOR EACH ROW EXECUTE FUNCTION public.generate_preventive_plan_numero();

-- Backfill existing plans (ordered by creation, per machine)
DO $$
DECLARE r RECORD; mcode text; cnt integer;
BEGIN
  FOR r IN SELECT id, machine_id FROM public.preventive_plans WHERE numero IS NULL OR numero = '' ORDER BY machine_id, created_at LOOP
    SELECT code INTO mcode FROM public.machines WHERE id = r.machine_id;
    mcode := COALESCE(mcode, 'GEN');
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero FROM '[0-9]+$') AS integer)), 0) + 1
      INTO cnt FROM public.preventive_plans
      WHERE machine_id = r.machine_id AND numero LIKE mcode || '-PRV-%';
    UPDATE public.preventive_plans SET numero = mcode || '-PRV-' || LPAD(cnt::text, 3, '0') WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS preventive_plans_numero_unique ON public.preventive_plans (numero);