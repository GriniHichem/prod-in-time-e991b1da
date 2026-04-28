-- ============================================================================
-- PHASE 1 — Global search infrastructure (French FTS + trigram)
-- ============================================================================

-- 0. Fix pre-existing broken trigger on consumptions (no updated_at column)
DROP TRIGGER IF EXISTS update_consumptions_updated_at ON public.consumptions;

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. french_unaccent text search configuration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'french_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION public.french_unaccent ( COPY = pg_catalog.french );
    ALTER TEXT SEARCH CONFIGURATION public.french_unaccent
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, french_stem;
  END IF;
END$$;

-- 3. Builder helper
CREATE OR REPLACE FUNCTION public.fts_build(VARIADIC parts text[])
RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT to_tsvector('public.french_unaccent', coalesce(array_to_string(parts, ' '), ''));
$$;

-- ============================================================================
-- 4. Per-table search_vector + trigger + indexes + backfill
-- ============================================================================

-- machines
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.machines_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_vector := public.fts_build(NEW.code, NEW.designation, NEW.description, NEW.localisation, NEW.marque, NEW.modele, NEW.numero_serie);
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trg_machines_search ON public.machines;
CREATE TRIGGER trg_machines_search BEFORE INSERT OR UPDATE ON public.machines FOR EACH ROW EXECUTE FUNCTION public.machines_search_refresh();
CREATE INDEX IF NOT EXISTS idx_machines_search ON public.machines USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_machines_trgm ON public.machines USING GIN (code gin_trgm_ops, designation gin_trgm_ops);
UPDATE public.machines SET search_vector = public.fts_build(code, designation, description, localisation, marque, modele, numero_serie) WHERE search_vector IS NULL;

-- equipements
ALTER TABLE public.equipements ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.equipements_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_vector := public.fts_build(NEW.code, NEW.designation, NEW.description, NEW.localisation, NEW.marque, NEW.modele, NEW.numero_serie);
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trg_equipements_search ON public.equipements;
CREATE TRIGGER trg_equipements_search BEFORE INSERT OR UPDATE ON public.equipements FOR EACH ROW EXECUTE FUNCTION public.equipements_search_refresh();
CREATE INDEX IF NOT EXISTS idx_equipements_search ON public.equipements USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_equipements_trgm ON public.equipements USING GIN (code gin_trgm_ops, designation gin_trgm_ops);
UPDATE public.equipements SET search_vector = public.fts_build(code, designation, description, localisation, marque, modele, numero_serie) WHERE search_vector IS NULL;

-- organes
ALTER TABLE public.organes ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.organes_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.code, NEW.designation, NEW.description); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_organes_search ON public.organes;
CREATE TRIGGER trg_organes_search BEFORE INSERT OR UPDATE ON public.organes FOR EACH ROW EXECUTE FUNCTION public.organes_search_refresh();
CREATE INDEX IF NOT EXISTS idx_organes_search ON public.organes USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_organes_trgm ON public.organes USING GIN (code gin_trgm_ops, designation gin_trgm_ops);
UPDATE public.organes SET search_vector = public.fts_build(code, designation, description) WHERE search_vector IS NULL;

-- production_lines
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.production_lines_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.code, NEW.designation, NEW.description, NEW.atelier); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_production_lines_search ON public.production_lines;
CREATE TRIGGER trg_production_lines_search BEFORE INSERT OR UPDATE ON public.production_lines FOR EACH ROW EXECUTE FUNCTION public.production_lines_search_refresh();
CREATE INDEX IF NOT EXISTS idx_production_lines_search ON public.production_lines USING GIN (search_vector);
UPDATE public.production_lines SET search_vector = public.fts_build(code, designation, description, atelier) WHERE search_vector IS NULL;

-- pdr
ALTER TABLE public.pdr ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.pdr_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.reference, NEW.designation, NEW.description, NEW.fournisseur, NEW.emplacement); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_pdr_search ON public.pdr;
CREATE TRIGGER trg_pdr_search BEFORE INSERT OR UPDATE ON public.pdr FOR EACH ROW EXECUTE FUNCTION public.pdr_search_refresh();
CREATE INDEX IF NOT EXISTS idx_pdr_search ON public.pdr USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_pdr_trgm ON public.pdr USING GIN (reference gin_trgm_ops, designation gin_trgm_ops);
UPDATE public.pdr SET search_vector = public.fts_build(reference, designation, description, fournisseur, emplacement) WHERE search_vector IS NULL;

-- tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.tickets_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.numero, NEW.description, NEW.cause_racine, NEW.solution); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_tickets_search ON public.tickets;
CREATE TRIGGER trg_tickets_search BEFORE INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.tickets_search_refresh();
CREATE INDEX IF NOT EXISTS idx_tickets_search ON public.tickets USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_tickets_trgm ON public.tickets USING GIN (numero gin_trgm_ops);
UPDATE public.tickets SET search_vector = public.fts_build(numero, description, cause_racine, solution) WHERE search_vector IS NULL;

-- interventions
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.interventions_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.description, NEW.notes); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_interventions_search ON public.interventions;
CREATE TRIGGER trg_interventions_search BEFORE INSERT OR UPDATE ON public.interventions FOR EACH ROW EXECUTE FUNCTION public.interventions_search_refresh();
CREATE INDEX IF NOT EXISTS idx_interventions_search ON public.interventions USING GIN (search_vector);
UPDATE public.interventions SET search_vector = public.fts_build(description, notes) WHERE search_vector IS NULL;

-- ordres_fabrication
ALTER TABLE public.ordres_fabrication ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.of_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.numero); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_of_search ON public.ordres_fabrication;
CREATE TRIGGER trg_of_search BEFORE INSERT OR UPDATE ON public.ordres_fabrication FOR EACH ROW EXECUTE FUNCTION public.of_search_refresh();
CREATE INDEX IF NOT EXISTS idx_of_search ON public.ordres_fabrication USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_of_trgm ON public.ordres_fabrication USING GIN (numero gin_trgm_ops);
UPDATE public.ordres_fabrication SET search_vector = public.fts_build(numero) WHERE search_vector IS NULL;

-- products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.products_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.code, NEW.designation, NEW.description, NEW.code_erp); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_products_search ON public.products;
CREATE TRIGGER trg_products_search BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_search_refresh();
CREATE INDEX IF NOT EXISTS idx_products_search ON public.products USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_products_trgm ON public.products USING GIN (code gin_trgm_ops, designation gin_trgm_ops);
UPDATE public.products SET search_vector = public.fts_build(code, designation, description, code_erp) WHERE search_vector IS NULL;

-- articles
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.articles_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.code, NEW.designation, NEW.description, NEW.code_erp, NEW.fournisseur); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_articles_search ON public.articles;
CREATE TRIGGER trg_articles_search BEFORE INSERT OR UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION public.articles_search_refresh();
CREATE INDEX IF NOT EXISTS idx_articles_search ON public.articles USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_articles_trgm ON public.articles USING GIN (code gin_trgm_ops, designation gin_trgm_ops);
UPDATE public.articles SET search_vector = public.fts_build(code, designation, description, code_erp, fournisseur) WHERE search_vector IS NULL;

-- recipes (build expression dynamically based on existing columns)
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS search_vector tsvector;
DO $$
DECLARE has_name bool; has_designation bool; has_code bool; has_description bool; expr text; backfill_cols text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='name') INTO has_name;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='designation') INTO has_designation;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='code') INTO has_code;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='description') INTO has_description;

  expr := 'public.fts_build(' || array_to_string(ARRAY[
    CASE WHEN has_code THEN 'NEW.code' END,
    CASE WHEN has_name THEN 'NEW.name' END,
    CASE WHEN has_designation THEN 'NEW.designation' END,
    CASE WHEN has_description THEN 'NEW.description' END
  ]::text[], ', ') || ')';
  IF expr = 'public.fts_build()' THEN expr := 'public.fts_build('''')'; END IF;

  backfill_cols := array_to_string(ARRAY[
    CASE WHEN has_code THEN 'code' END,
    CASE WHEN has_name THEN 'name' END,
    CASE WHEN has_designation THEN 'designation' END,
    CASE WHEN has_description THEN 'description' END
  ]::text[], ', ');
  IF backfill_cols = '' THEN backfill_cols := ''''''; END IF;

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.recipes_search_refresh() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $body$
    BEGIN NEW.search_vector := %s; RETURN NEW; END
    $body$;
  $f$, expr);

  EXECUTE 'DROP TRIGGER IF EXISTS trg_recipes_search ON public.recipes';
  EXECUTE 'CREATE TRIGGER trg_recipes_search BEFORE INSERT OR UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.recipes_search_refresh()';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recipes_search ON public.recipes USING GIN (search_vector)';
  EXECUTE format('UPDATE public.recipes SET search_vector = public.fts_build(%s) WHERE search_vector IS NULL', backfill_cols);
END$$;

-- preventive_plans
ALTER TABLE public.preventive_plans ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.preventive_plans_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.title, NEW.description, COALESCE(NEW.checklist::text,'')); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_preventive_plans_search ON public.preventive_plans;
CREATE TRIGGER trg_preventive_plans_search BEFORE INSERT OR UPDATE ON public.preventive_plans FOR EACH ROW EXECUTE FUNCTION public.preventive_plans_search_refresh();
CREATE INDEX IF NOT EXISTS idx_preventive_plans_search ON public.preventive_plans USING GIN (search_vector);
UPDATE public.preventive_plans SET search_vector = public.fts_build(title, description, COALESCE(checklist::text,'')) WHERE search_vector IS NULL;

-- production_stops
ALTER TABLE public.production_stops ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.production_stops_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.description, NEW.type::text); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_production_stops_search ON public.production_stops;
CREATE TRIGGER trg_production_stops_search BEFORE INSERT OR UPDATE ON public.production_stops FOR EACH ROW EXECUTE FUNCTION public.production_stops_search_refresh();
CREATE INDEX IF NOT EXISTS idx_production_stops_search ON public.production_stops USING GIN (search_vector);
UPDATE public.production_stops SET search_vector = public.fts_build(description, type::text) WHERE search_vector IS NULL;

-- consumptions (no updated_at — broken trigger removed at top)
ALTER TABLE public.consumptions ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.consumptions_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.notes); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_consumptions_search ON public.consumptions;
CREATE TRIGGER trg_consumptions_search BEFORE INSERT OR UPDATE ON public.consumptions FOR EACH ROW EXECUTE FUNCTION public.consumptions_search_refresh();
CREATE INDEX IF NOT EXISTS idx_consumptions_search ON public.consumptions USING GIN (search_vector);
UPDATE public.consumptions SET search_vector = public.fts_build(notes) WHERE search_vector IS NULL;

-- audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.audit_logs_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.action, NEW.action_label, NEW.description, NEW.entity_label, NEW.entity_code, NEW.user_full_name, NEW.user_email); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_audit_logs_search ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_search BEFORE INSERT OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_search_refresh();
CREATE INDEX IF NOT EXISTS idx_audit_logs_search ON public.audit_logs USING GIN (search_vector);
UPDATE public.audit_logs SET search_vector = public.fts_build(action, action_label, description, entity_label, entity_code, user_full_name, user_email) WHERE search_vector IS NULL;

-- notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.notifications_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.title, NEW.message, NEW.entity_label, NEW.entity_code); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_notifications_search ON public.notifications;
CREATE TRIGGER trg_notifications_search BEFORE INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notifications_search_refresh();
CREATE INDEX IF NOT EXISTS idx_notifications_search ON public.notifications USING GIN (search_vector);
UPDATE public.notifications SET search_vector = public.fts_build(title, message, entity_label, entity_code) WHERE search_vector IS NULL;

-- validation_requests
ALTER TABLE public.validation_requests ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.validation_requests_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_vector := public.fts_build(
    NEW.title, NEW.description, NEW.justification, NEW.validation_comment,
    NEW.entity_type, NEW.entity_label, NEW.entity_code, NEW.module, NEW.requested_action
  );
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trg_validation_requests_search ON public.validation_requests;
CREATE TRIGGER trg_validation_requests_search BEFORE INSERT OR UPDATE ON public.validation_requests FOR EACH ROW EXECUTE FUNCTION public.validation_requests_search_refresh();
CREATE INDEX IF NOT EXISTS idx_validation_requests_search ON public.validation_requests USING GIN (search_vector);
UPDATE public.validation_requests SET search_vector = public.fts_build(title, description, justification, validation_comment, entity_type, entity_label, entity_code, module, requested_action) WHERE search_vector IS NULL;

-- entity_documents
ALTER TABLE public.entity_documents ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.entity_documents_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.file_name, NEW.description, NEW.entity_type); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_entity_documents_search ON public.entity_documents;
CREATE TRIGGER trg_entity_documents_search BEFORE INSERT OR UPDATE ON public.entity_documents FOR EACH ROW EXECUTE FUNCTION public.entity_documents_search_refresh();
CREATE INDEX IF NOT EXISTS idx_entity_documents_search ON public.entity_documents USING GIN (search_vector);
UPDATE public.entity_documents SET search_vector = public.fts_build(file_name, description, entity_type) WHERE search_vector IS NULL;

-- pdr_stock_movements
ALTER TABLE public.pdr_stock_movements ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.pdr_stock_movements_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.motif, NEW.reference_source, NEW.ref_document_erp, NEW.source_type, NEW.type::text); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_pdr_stock_movements_search ON public.pdr_stock_movements;
CREATE TRIGGER trg_pdr_stock_movements_search BEFORE INSERT OR UPDATE ON public.pdr_stock_movements FOR EACH ROW EXECUTE FUNCTION public.pdr_stock_movements_search_refresh();
CREATE INDEX IF NOT EXISTS idx_pdr_stock_movements_search ON public.pdr_stock_movements USING GIN (search_vector);
UPDATE public.pdr_stock_movements SET search_vector = public.fts_build(motif, reference_source, ref_document_erp, source_type, type::text) WHERE search_vector IS NULL;

-- pdr_family_suppliers
ALTER TABLE public.pdr_family_suppliers ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE OR REPLACE FUNCTION public.pdr_family_suppliers_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := public.fts_build(NEW.nom, NEW.reference_fournisseur, NEW.email, NEW.tel, NEW.adresse, NEW.notes); RETURN NEW; END$$;
DROP TRIGGER IF EXISTS trg_pdr_family_suppliers_search ON public.pdr_family_suppliers;
CREATE TRIGGER trg_pdr_family_suppliers_search BEFORE INSERT OR UPDATE ON public.pdr_family_suppliers FOR EACH ROW EXECUTE FUNCTION public.pdr_family_suppliers_search_refresh();
CREATE INDEX IF NOT EXISTS idx_pdr_family_suppliers_search ON public.pdr_family_suppliers USING GIN (search_vector);
UPDATE public.pdr_family_suppliers SET search_vector = public.fts_build(nom, reference_fournisseur, email, tel, adresse, notes) WHERE search_vector IS NULL;

-- ============================================================================
-- 5. global_search RPC — RLS-respecting (SECURITY INVOKER)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.global_search(
  q text,
  modules text[] DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to   timestamptz DEFAULT NULL,
  limit_per_module int DEFAULT 10
)
RETURNS TABLE (
  module      text,
  entity_id   uuid,
  code        text,
  label       text,
  snippet     text,
  severity    text,
  url         text,
  updated_at  timestamptz,
  score       real
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  ts_q tsquery;
  trgm_q text;
  want   text[];
BEGIN
  IF q IS NULL OR length(btrim(q)) = 0 THEN RETURN; END IF;

  trgm_q := lower(unaccent(btrim(q)));
  ts_q := websearch_to_tsquery('public.french_unaccent', q);

  want := COALESCE(modules, ARRAY[
    'machines','equipements','organes','lignes','pdr','tickets','interventions',
    'of','products','articles','recipes','preventif','arrets','consommations',
    'audit','notifications','validations','documents','pdr_movements','fournisseurs'
  ]);

  IF 'machines' = ANY(want) THEN
    RETURN QUERY
    SELECT 'machines'::text, m.id, m.code, m.designation,
           ts_headline('public.french_unaccent', concat_ws(' • ', m.designation, m.description, m.localisation), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=22,MinWords=5'),
           m.criticite::text, '/machines/'||m.id::text, m.updated_at,
           (ts_rank_cd(m.search_vector, ts_q) + similarity(coalesce(m.code,''), trgm_q))::real
    FROM public.machines m
    WHERE (m.search_vector @@ ts_q OR m.code ILIKE '%'||trgm_q||'%' OR m.designation % trgm_q)
      AND (date_from IS NULL OR m.updated_at >= date_from)
      AND (date_to IS NULL OR m.updated_at <= date_to)
    ORDER BY 9 DESC, m.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'equipements' = ANY(want) THEN
    RETURN QUERY
    SELECT 'equipements'::text, e.id, e.code, e.designation,
           ts_headline('public.french_unaccent', concat_ws(' • ', e.designation, e.description), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=22,MinWords=5'),
           e.criticite::text, '/equipements/'||e.id::text, e.updated_at,
           (ts_rank_cd(e.search_vector, ts_q) + similarity(coalesce(e.code,''), trgm_q))::real
    FROM public.equipements e
    WHERE (e.search_vector @@ ts_q OR e.code ILIKE '%'||trgm_q||'%' OR e.designation % trgm_q)
      AND (date_from IS NULL OR e.updated_at >= date_from)
      AND (date_to IS NULL OR e.updated_at <= date_to)
    ORDER BY 9 DESC, e.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'organes' = ANY(want) THEN
    RETURN QUERY
    SELECT 'organes'::text, o.id, o.code, o.designation,
           ts_headline('public.french_unaccent', concat_ws(' • ', o.designation, o.description), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=22,MinWords=5'),
           o.criticite::text, '/organes/'||o.id::text, o.updated_at,
           (ts_rank_cd(o.search_vector, ts_q) + similarity(coalesce(o.code,''), trgm_q))::real
    FROM public.organes o
    WHERE (o.search_vector @@ ts_q OR o.code ILIKE '%'||trgm_q||'%' OR o.designation % trgm_q)
      AND (date_from IS NULL OR o.updated_at >= date_from)
      AND (date_to IS NULL OR o.updated_at <= date_to)
    ORDER BY 9 DESC, o.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'lignes' = ANY(want) THEN
    RETURN QUERY
    SELECT 'lignes'::text, l.id, l.code, l.designation,
           ts_headline('public.french_unaccent', concat_ws(' • ', l.designation, l.description, l.atelier), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=20'),
           NULL::text, '/lignes/'||l.id::text, l.updated_at,
           (ts_rank_cd(l.search_vector, ts_q))::real
    FROM public.production_lines l
    WHERE l.search_vector @@ ts_q
      AND (date_from IS NULL OR l.updated_at >= date_from)
      AND (date_to IS NULL OR l.updated_at <= date_to)
    ORDER BY 9 DESC, l.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'pdr' = ANY(want) THEN
    RETURN QUERY
    SELECT 'pdr'::text, p.id, p.reference, p.designation,
           ts_headline('public.french_unaccent', concat_ws(' • ', p.designation, p.description, p.fournisseur, p.emplacement), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=22,MinWords=5'),
           p.statut_pdr::text, '/pdr/'||p.id::text, p.updated_at,
           (ts_rank_cd(p.search_vector, ts_q) + similarity(coalesce(p.reference,''), trgm_q))::real
    FROM public.pdr p
    WHERE (p.search_vector @@ ts_q OR p.reference ILIKE '%'||trgm_q||'%' OR p.designation % trgm_q)
      AND (date_from IS NULL OR p.updated_at >= date_from)
      AND (date_to IS NULL OR p.updated_at <= date_to)
    ORDER BY 9 DESC, p.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'tickets' = ANY(want) THEN
    RETURN QUERY
    SELECT 'tickets'::text, t.id, t.numero, left(coalesce(t.description,''),80),
           ts_headline('public.french_unaccent', concat_ws(' • ', t.description, t.cause_racine, t.solution), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=24,MinWords=6'),
           t.statut::text, '/tickets/'||t.id::text, t.updated_at,
           (ts_rank_cd(t.search_vector, ts_q) + similarity(coalesce(t.numero,''), trgm_q))::real
    FROM public.tickets t
    WHERE (t.search_vector @@ ts_q OR t.numero ILIKE '%'||trgm_q||'%')
      AND (date_from IS NULL OR t.updated_at >= date_from)
      AND (date_to IS NULL OR t.updated_at <= date_to)
    ORDER BY 9 DESC, t.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'interventions' = ANY(want) THEN
    RETURN QUERY
    SELECT 'interventions'::text, i.id, NULL::text, left(coalesce(i.description,''),80),
           ts_headline('public.french_unaccent', concat_ws(' • ', i.description, i.notes), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=24'),
           i.statut::text, '/tickets/'||i.ticket_id::text, i.updated_at,
           (ts_rank_cd(i.search_vector, ts_q))::real
    FROM public.interventions i
    WHERE i.search_vector @@ ts_q
      AND (date_from IS NULL OR i.updated_at >= date_from)
      AND (date_to IS NULL OR i.updated_at <= date_to)
    ORDER BY 9 DESC, i.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'of' = ANY(want) THEN
    RETURN QUERY
    SELECT 'of'::text, of.id, of.numero, NULL::text,
           ts_headline('public.french_unaccent', of.numero, ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=10'),
           of.statut::text, '/gpao/of/'||of.id::text, of.updated_at,
           (ts_rank_cd(of.search_vector, ts_q) + similarity(coalesce(of.numero,''), trgm_q))::real
    FROM public.ordres_fabrication of
    WHERE (of.search_vector @@ ts_q OR of.numero ILIKE '%'||trgm_q||'%')
      AND (date_from IS NULL OR of.updated_at >= date_from)
      AND (date_to IS NULL OR of.updated_at <= date_to)
    ORDER BY 9 DESC, of.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'products' = ANY(want) THEN
    RETURN QUERY
    SELECT 'products'::text, p.id, p.code, p.designation,
           ts_headline('public.french_unaccent', concat_ws(' • ', p.designation, p.description), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=20'),
           NULL::text, '/gpao/produits/'||p.id::text, p.updated_at,
           (ts_rank_cd(p.search_vector, ts_q) + similarity(coalesce(p.code,''), trgm_q))::real
    FROM public.products p
    WHERE (p.search_vector @@ ts_q OR p.code ILIKE '%'||trgm_q||'%' OR p.designation % trgm_q)
      AND (date_from IS NULL OR p.updated_at >= date_from)
      AND (date_to IS NULL OR p.updated_at <= date_to)
    ORDER BY 9 DESC, p.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'articles' = ANY(want) THEN
    RETURN QUERY
    SELECT 'articles'::text, a.id, a.code, a.designation,
           ts_headline('public.french_unaccent', concat_ws(' • ', a.designation, a.description, a.fournisseur), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=20'),
           NULL::text, '/gpao/articles/'||a.id::text, a.updated_at,
           (ts_rank_cd(a.search_vector, ts_q) + similarity(coalesce(a.code,''), trgm_q))::real
    FROM public.articles a
    WHERE (a.search_vector @@ ts_q OR a.code ILIKE '%'||trgm_q||'%' OR a.designation % trgm_q)
      AND (date_from IS NULL OR a.updated_at >= date_from)
      AND (date_to IS NULL OR a.updated_at <= date_to)
    ORDER BY 9 DESC, a.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'preventif' = ANY(want) THEN
    RETURN QUERY
    SELECT 'preventif'::text, pp.id, NULL::text, pp.title,
           ts_headline('public.french_unaccent', concat_ws(' • ', pp.title, pp.description), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=22'),
           pp.statut_plan::text, '/preventif/'||pp.id::text, pp.updated_at,
           (ts_rank_cd(pp.search_vector, ts_q))::real
    FROM public.preventive_plans pp
    WHERE pp.search_vector @@ ts_q
      AND (date_from IS NULL OR pp.updated_at >= date_from)
      AND (date_to IS NULL OR pp.updated_at <= date_to)
    ORDER BY 9 DESC, pp.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'arrets' = ANY(want) THEN
    RETURN QUERY
    SELECT 'arrets'::text, s.id, NULL::text, left(coalesce(s.description,''),80),
           ts_headline('public.french_unaccent', s.description, ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=20'),
           s.type::text, '/gpao/arrets', s.updated_at,
           (ts_rank_cd(s.search_vector, ts_q))::real
    FROM public.production_stops s
    WHERE s.search_vector @@ ts_q
      AND (date_from IS NULL OR s.updated_at >= date_from)
      AND (date_to IS NULL OR s.updated_at <= date_to)
    ORDER BY 9 DESC, s.updated_at DESC LIMIT limit_per_module;
  END IF;

  IF 'consommations' = ANY(want) THEN
    RETURN QUERY
    SELECT 'consommations'::text, c.id, NULL::text, left(coalesce(c.notes,''),80),
           ts_headline('public.french_unaccent', c.notes, ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=20'),
           NULL::text, '/gpao/consommations', c.created_at,
           (ts_rank_cd(c.search_vector, ts_q))::real
    FROM public.consumptions c
    WHERE c.search_vector @@ ts_q
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND (date_to IS NULL OR c.created_at <= date_to)
    ORDER BY 9 DESC, c.created_at DESC LIMIT limit_per_module;
  END IF;

  IF 'audit' = ANY(want) THEN
    RETURN QUERY
    SELECT 'audit'::text, a.id, a.entity_code, coalesce(a.action_label, a.action),
           ts_headline('public.french_unaccent', concat_ws(' • ', a.description, a.entity_label, a.user_full_name), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=24'),
           a.severity, '/audit', a.created_at,
           (ts_rank_cd(a.search_vector, ts_q))::real
    FROM public.audit_logs a
    WHERE a.search_vector @@ ts_q
      AND (date_from IS NULL OR a.created_at >= date_from)
      AND (date_to IS NULL OR a.created_at <= date_to)
    ORDER BY 9 DESC, a.created_at DESC LIMIT limit_per_module;
  END IF;

  IF 'notifications' = ANY(want) THEN
    RETURN QUERY
    SELECT 'notifications'::text, n.id, n.entity_code, n.title,
           ts_headline('public.french_unaccent', concat_ws(' • ', n.message, n.entity_label), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=22'),
           n.severity::text, coalesce(n.action_url, '/notifications'), n.created_at,
           (ts_rank_cd(n.search_vector, ts_q))::real
    FROM public.notifications n
    WHERE n.search_vector @@ ts_q
      AND (date_from IS NULL OR n.created_at >= date_from)
      AND (date_to IS NULL OR n.created_at <= date_to)
    ORDER BY 9 DESC, n.created_at DESC LIMIT limit_per_module;
  END IF;

  IF 'validations' = ANY(want) THEN
    RETURN QUERY
    SELECT 'validations'::text, vr.id, vr.entity_code, vr.title,
           ts_headline('public.french_unaccent', concat_ws(' • ', vr.description, vr.justification, vr.validation_comment, vr.entity_label), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=22'),
           vr.status::text, '/validations', vr.created_at,
           (ts_rank_cd(vr.search_vector, ts_q))::real
    FROM public.validation_requests vr
    WHERE vr.search_vector @@ ts_q
      AND (date_from IS NULL OR vr.created_at >= date_from)
      AND (date_to IS NULL OR vr.created_at <= date_to)
    ORDER BY 9 DESC, vr.created_at DESC LIMIT limit_per_module;
  END IF;

  IF 'documents' = ANY(want) THEN
    RETURN QUERY
    SELECT 'documents'::text, d.id, NULL::text, d.file_name,
           ts_headline('public.french_unaccent', concat_ws(' • ', d.file_name, d.description), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=20'),
           d.entity_type, d.file_url, d.created_at,
           (ts_rank_cd(d.search_vector, ts_q))::real
    FROM public.entity_documents d
    WHERE d.search_vector @@ ts_q
      AND (date_from IS NULL OR d.created_at >= date_from)
      AND (date_to IS NULL OR d.created_at <= date_to)
    ORDER BY 9 DESC, d.created_at DESC LIMIT limit_per_module;
  END IF;

  IF 'pdr_movements' = ANY(want) THEN
    RETURN QUERY
    SELECT 'pdr_movements'::text, m.id, m.ref_document_erp, coalesce(m.motif, m.type::text),
           ts_headline('public.french_unaccent', concat_ws(' • ', m.motif, m.reference_source, m.ref_document_erp), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=20'),
           m.type::text, '/pdr/'||m.pdr_id::text, m.created_at,
           (ts_rank_cd(m.search_vector, ts_q))::real
    FROM public.pdr_stock_movements m
    WHERE m.search_vector @@ ts_q
      AND (date_from IS NULL OR m.created_at >= date_from)
      AND (date_to IS NULL OR m.created_at <= date_to)
    ORDER BY 9 DESC, m.created_at DESC LIMIT limit_per_module;
  END IF;

  IF 'fournisseurs' = ANY(want) THEN
    RETURN QUERY
    SELECT 'fournisseurs'::text, s.id, s.reference_fournisseur, s.nom,
           ts_headline('public.french_unaccent', concat_ws(' • ', s.nom, s.adresse, s.email, s.notes), ts_q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=22'),
           NULL::text, '/parametres', s.updated_at,
           (ts_rank_cd(s.search_vector, ts_q))::real
    FROM public.pdr_family_suppliers s
    WHERE s.search_vector @@ ts_q
      AND (date_from IS NULL OR s.updated_at >= date_from)
      AND (date_to IS NULL OR s.updated_at <= date_to)
    ORDER BY 9 DESC, s.updated_at DESC LIMIT limit_per_module;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.global_search(text, text[], timestamptz, timestamptz, int) TO authenticated;

-- ============================================================================
-- 6. search_suggest RPC (autocomplete)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.search_suggest(q text, max_results int DEFAULT 8)
RETURNS TABLE (module text, label text, code text, url text, score real)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH qq AS (SELECT lower(unaccent(btrim(q))) AS s)
  SELECT * FROM (
    SELECT 'machines'::text, m.designation, m.code, '/machines/'||m.id::text,
           GREATEST(similarity(lower(unaccent(m.code)), (SELECT s FROM qq)),
                    similarity(lower(unaccent(m.designation)), (SELECT s FROM qq)))::real AS sc
    FROM public.machines m
    WHERE (SELECT s FROM qq) <> '' AND (m.code ILIKE '%'||(SELECT s FROM qq)||'%' OR m.designation % (SELECT s FROM qq))
    UNION ALL
    SELECT 'pdr', p.designation, p.reference, '/pdr/'||p.id::text,
           GREATEST(similarity(lower(unaccent(p.reference)), (SELECT s FROM qq)),
                    similarity(lower(unaccent(p.designation)), (SELECT s FROM qq)))::real
    FROM public.pdr p
    WHERE (SELECT s FROM qq) <> '' AND (p.reference ILIKE '%'||(SELECT s FROM qq)||'%' OR p.designation % (SELECT s FROM qq))
    UNION ALL
    SELECT 'tickets', left(coalesce(t.description,''),60), t.numero, '/tickets/'||t.id::text,
           similarity(lower(unaccent(t.numero)), (SELECT s FROM qq))::real
    FROM public.tickets t
    WHERE (SELECT s FROM qq) <> '' AND t.numero ILIKE '%'||(SELECT s FROM qq)||'%'
    UNION ALL
    SELECT 'of', NULL, of.numero, '/gpao/of/'||of.id::text,
           similarity(lower(unaccent(of.numero)), (SELECT s FROM qq))::real
    FROM public.ordres_fabrication of
    WHERE (SELECT s FROM qq) <> '' AND of.numero ILIKE '%'||(SELECT s FROM qq)||'%'
    UNION ALL
    SELECT 'products', p.designation, p.code, '/gpao/produits/'||p.id::text,
           GREATEST(similarity(lower(unaccent(p.code)), (SELECT s FROM qq)),
                    similarity(lower(unaccent(p.designation)), (SELECT s FROM qq)))::real
    FROM public.products p
    WHERE (SELECT s FROM qq) <> '' AND (p.code ILIKE '%'||(SELECT s FROM qq)||'%' OR p.designation % (SELECT s FROM qq))
    UNION ALL
    SELECT 'articles', a.designation, a.code, '/gpao/articles/'||a.id::text,
           GREATEST(similarity(lower(unaccent(a.code)), (SELECT s FROM qq)),
                    similarity(lower(unaccent(a.designation)), (SELECT s FROM qq)))::real
    FROM public.articles a
    WHERE (SELECT s FROM qq) <> '' AND (a.code ILIKE '%'||(SELECT s FROM qq)||'%' OR a.designation % (SELECT s FROM qq))
  ) sub
  ORDER BY sc DESC NULLS LAST
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION public.search_suggest(text, int) TO authenticated;
