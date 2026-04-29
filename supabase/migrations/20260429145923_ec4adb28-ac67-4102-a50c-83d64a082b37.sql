-- Enums
DO $$ BEGIN
  CREATE TYPE public.nc_type AS ENUM (
    'produit_fini','emballage','matiere_premiere','process','hygiene',
    'etiquetage','poids','aspect','securite_alimentaire','autre'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.nc_severity AS ENUM ('minor','major','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.nc_status AS ENUM (
    'draft','declared','under_review','blocked','decision_pending',
    'action_in_progress','verified','closed','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.nc_decision AS ENUM (
    'bloquer_lot','liberer','liberer_sous_derogation','retraiter','trier',
    'rebuter','retour_fournisseur','quarantaine','autre'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.quality_non_conformities (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_number             text UNIQUE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  detected_at           timestamptz NOT NULL DEFAULT now(),
  declared_by           uuid,
  of_id                 uuid,
  quality_check_id      uuid,
  product_id            uuid,
  production_line_id    uuid,
  shift_id              uuid,
  team_id               uuid,
  article_id            uuid,
  packaging_article_id  uuid,
  batch_number          text,
  lot_number            text,
  nc_type               public.nc_type NOT NULL,
  nc_category           text,
  severity              public.nc_severity NOT NULL DEFAULT 'minor',
  status                public.nc_status NOT NULL DEFAULT 'draft',
  title                 text NOT NULL,
  description           text,
  detected_quantity     numeric,
  affected_quantity     numeric,
  unit                  text,
  immediate_action      text,
  root_cause            text,
  decision              public.nc_decision,
  decision_by           uuid,
  decision_at           timestamptz,
  closure_comment       text,
  closed_by             uuid,
  closed_at             timestamptz,
  validation_status     text NOT NULL DEFAULT 'not_required',
  metadata              jsonb,
  search_vector         tsvector
);

CREATE INDEX IF NOT EXISTS idx_qnc_of ON public.quality_non_conformities (of_id);
CREATE INDEX IF NOT EXISTS idx_qnc_status ON public.quality_non_conformities (status);
CREATE INDEX IF NOT EXISTS idx_qnc_detected_at ON public.quality_non_conformities (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_qnc_search ON public.quality_non_conformities USING gin(search_vector);

CREATE OR REPLACE FUNCTION public.generate_nc_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NEW.nc_number IS NULL OR NEW.nc_number = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(nc_number FROM 4) AS integer)), 0) + 1
      INTO n FROM public.quality_non_conformities
     WHERE nc_number ~ '^NC-[0-9]+$';
    NEW.nc_number := 'NC-' || LPAD(n::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_qnc_number ON public.quality_non_conformities;
CREATE TRIGGER trg_qnc_number BEFORE INSERT ON public.quality_non_conformities
FOR EACH ROW EXECUTE FUNCTION public.generate_nc_number();

CREATE OR REPLACE FUNCTION public.quality_nc_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.validation_status NOT IN ('not_required','pending','approved','rejected') THEN
    RAISE EXCEPTION 'validation_status invalide: %', NEW.validation_status;
  END IF;
  IF NEW.status = 'closed' THEN
    IF NEW.closed_at IS NULL THEN NEW.closed_at := now(); END IF;
    IF NEW.closed_by IS NULL THEN NEW.closed_by := auth.uid(); END IF;
    IF NEW.closure_comment IS NULL OR length(btrim(NEW.closure_comment)) = 0 THEN
      RAISE EXCEPTION 'closure_comment requis pour clôturer une NC';
    END IF;
  END IF;
  IF NEW.decision IS NOT NULL THEN
    IF NEW.decision_at IS NULL THEN NEW.decision_at := now(); END IF;
    IF NEW.decision_by IS NULL THEN NEW.decision_by := auth.uid(); END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_qnc_validate ON public.quality_non_conformities;
CREATE TRIGGER trg_qnc_validate BEFORE INSERT OR UPDATE ON public.quality_non_conformities
FOR EACH ROW EXECUTE FUNCTION public.quality_nc_validate();

CREATE OR REPLACE FUNCTION public.quality_nc_search_refresh()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_vector := public.fts_build(NEW.nc_number, NEW.title, NEW.description, NEW.closure_comment, NEW.batch_number, NEW.lot_number);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_qnc_search ON public.quality_non_conformities;
CREATE TRIGGER trg_qnc_search BEFORE INSERT OR UPDATE ON public.quality_non_conformities
FOR EACH ROW EXECUTE FUNCTION public.quality_nc_search_refresh();

ALTER TABLE public.quality_non_conformities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "NC viewable by authenticated" ON public.quality_non_conformities;
CREATE POLICY "NC viewable by authenticated"
  ON public.quality_non_conformities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "NC insert by authorized" ON public.quality_non_conformities;
CREATE POLICY "NC insert by authorized"
  ON public.quality_non_conformities FOR INSERT TO authenticated
  WITH CHECK (
    declared_by = auth.uid()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'resp_production'::app_role)
      OR has_role(auth.uid(), 'chef_ligne'::app_role)
      OR has_role(auth.uid(), 'bureau_methode'::app_role)
      OR has_role(auth.uid(), 'controleur_qualite'::app_role)
    )
  );

DROP POLICY IF EXISTS "NC update by authorized" ON public.quality_non_conformities;
CREATE POLICY "NC update by authorized"
  ON public.quality_non_conformities FOR UPDATE TO authenticated
  USING (
    declared_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'resp_production'::app_role)
    OR has_role(auth.uid(), 'chef_ligne'::app_role)
    OR has_role(auth.uid(), 'bureau_methode'::app_role)
    OR has_role(auth.uid(), 'controleur_qualite'::app_role)
  );

DROP POLICY IF EXISTS "NC delete by admin" ON public.quality_non_conformities;
CREATE POLICY "NC delete by admin"
  ON public.quality_non_conformities FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));