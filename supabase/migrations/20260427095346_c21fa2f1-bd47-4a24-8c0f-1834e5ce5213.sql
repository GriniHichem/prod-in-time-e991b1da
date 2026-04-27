
-- ========== ENUMS ==========
DO $$ BEGIN
  CREATE TYPE public.organe_type AS ENUM ('mecanique','electrique','pneumatique','hydraulique','electronique','automatisme','instrumentation','autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.organe_statut AS ENUM ('en_service','en_panne','en_maintenance','hors_service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ========== ORGANES ==========
CREATE TABLE IF NOT EXISTS public.organes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  designation text NOT NULL,
  description text DEFAULT '',
  type public.organe_type NOT NULL DEFAULT 'autre',
  statut public.organe_statut NOT NULL DEFAULT 'en_service',
  criticite public.criticite NOT NULL DEFAULT 'C',
  machine_id uuid REFERENCES public.machines(id) ON DELETE CASCADE,
  equipement_id uuid REFERENCES public.equipements(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organes_parent_xor CHECK (
    (machine_id IS NOT NULL AND equipement_id IS NULL)
    OR (machine_id IS NULL AND equipement_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_organes_machine ON public.organes(machine_id);
CREATE INDEX IF NOT EXISTS idx_organes_equipement ON public.organes(equipement_id);

ALTER TABLE public.organes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organes viewable by authenticated"
  ON public.organes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Maintenance can manage organes"
  ON public.organes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'resp_maintenance'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'resp_maintenance'::app_role));

CREATE TRIGGER trg_organes_updated_at
  BEFORE UPDATE ON public.organes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== PDR ENTITY LINKS ==========
CREATE TABLE IF NOT EXISTS public.pdr_entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdr_id uuid NOT NULL REFERENCES public.pdr(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('machine','equipement','organe')),
  entity_id uuid NOT NULL,
  quantite_recommandee integer NOT NULL DEFAULT 1,
  commentaire text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pdr_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_pel_pdr ON public.pdr_entity_links(pdr_id);
CREATE INDEX IF NOT EXISTS idx_pel_entity ON public.pdr_entity_links(entity_type, entity_id);

ALTER TABLE public.pdr_entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PDR links viewable by authenticated"
  ON public.pdr_entity_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "Maintenance can manage pdr_entity_links"
  ON public.pdr_entity_links FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'resp_maintenance'::app_role)
    OR has_role(auth.uid(),'maintenancier'::app_role)
    OR has_role(auth.uid(),'gestionnaire_magasin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'resp_maintenance'::app_role)
    OR has_role(auth.uid(),'maintenancier'::app_role)
    OR has_role(auth.uid(),'gestionnaire_magasin'::app_role)
  );

CREATE TRIGGER trg_pel_updated_at
  BEFORE UPDATE ON public.pdr_entity_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill from machine_pdr (compatibility, original table kept)
INSERT INTO public.pdr_entity_links (pdr_id, entity_type, entity_id, quantite_recommandee)
SELECT pdr_id, 'machine', machine_id, COALESCE(quantite_recommandee, 1)
FROM public.machine_pdr
ON CONFLICT (pdr_id, entity_type, entity_id) DO NOTHING;

-- ========== TICKETS / PREVENTIVE / INSTANCES (additive) ==========
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS equipement_id uuid REFERENCES public.equipements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organe_id uuid REFERENCES public.organes(id) ON DELETE SET NULL;

ALTER TABLE public.preventive_plans
  ADD COLUMN IF NOT EXISTS equipement_id uuid REFERENCES public.equipements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organe_id uuid REFERENCES public.organes(id) ON DELETE SET NULL;

ALTER TABLE public.pdr_instances
  ADD COLUMN IF NOT EXISTS organe_id uuid REFERENCES public.organes(id) ON DELETE SET NULL;

-- ========== ROLE PERMISSIONS for "organes" module ==========
INSERT INTO public.role_permissions (role, module, can_view, can_create, can_edit, can_delete)
SELECT r.role, 'organes',
  true,
  r.role IN ('admin','resp_maintenance'),
  r.role IN ('admin','resp_maintenance'),
  r.role IN ('admin','resp_maintenance')
FROM (SELECT DISTINCT role FROM public.role_permissions) r
ON CONFLICT DO NOTHING;

-- ========== DOCUMENT PERMISSIONS for "organe" entity ==========
INSERT INTO public.document_permissions (role, entity_type, can_view, can_upload, can_download, can_delete, can_edit_metadata)
SELECT DISTINCT dp.role, 'organe', dp.can_view, dp.can_upload, dp.can_download, dp.can_delete, dp.can_edit_metadata
FROM public.document_permissions dp
WHERE dp.entity_type = 'machine'
ON CONFLICT DO NOTHING;
