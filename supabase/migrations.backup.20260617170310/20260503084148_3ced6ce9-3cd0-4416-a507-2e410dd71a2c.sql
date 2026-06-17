
-- ============================================================================
-- PDR Install Positions — hybrid tracking (single PDR ref + per-asset positions)
-- ============================================================================

CREATE TABLE public.pdr_install_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.pdr_entity_links(id) ON DELETE CASCADE,
  position_index int NOT NULL,
  designation text NOT NULL,
  description text,
  marker_x numeric,
  marker_y numeric,
  statut text NOT NULL DEFAULT 'active',
  lifespan_mode text NOT NULL DEFAULT 'time',
  seuil_min numeric,
  seuil_max numeric,
  seuil_alerte_pct numeric DEFAULT 80,
  unite_mesure text,
  production_rule text,
  production_coefficient numeric DEFAULT 1,
  compteur_manuel numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT pdr_pos_statut_chk CHECK (statut IN ('active','inactive','supprimee')),
  CONSTRAINT pdr_pos_lifespan_chk CHECK (lifespan_mode IN ('time','production','mixte','none')),
  CONSTRAINT pdr_pos_prod_rule_chk CHECK (production_rule IS NULL OR production_rule IN ('complete','reparti','coefficient','manuel')),
  CONSTRAINT pdr_pos_min_nonneg CHECK (seuil_min IS NULL OR seuil_min >= 0),
  CONSTRAINT pdr_pos_max_nonneg CHECK (seuil_max IS NULL OR seuil_max >= 0),
  CONSTRAINT pdr_pos_manual_nonneg CHECK (compteur_manuel IS NULL OR compteur_manuel >= 0),
  CONSTRAINT pdr_pos_marker_x_range CHECK (marker_x IS NULL OR (marker_x >= 0 AND marker_x <= 100)),
  CONSTRAINT pdr_pos_marker_y_range CHECK (marker_y IS NULL OR (marker_y >= 0 AND marker_y <= 100)),
  CONSTRAINT pdr_pos_unique_idx UNIQUE (link_id, position_index)
);

CREATE INDEX idx_pdr_pos_link ON public.pdr_install_positions(link_id);
CREATE INDEX idx_pdr_pos_statut ON public.pdr_install_positions(statut);

-- Validation trigger (use trigger, not check, per project convention)
CREATE OR REPLACE FUNCTION public.tg_pdr_position_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- min <= max
  IF NEW.seuil_min IS NOT NULL AND NEW.seuil_max IS NOT NULL AND NEW.seuil_min > NEW.seuil_max THEN
    RAISE EXCEPTION 'seuil_min (%) doit être <= seuil_max (%)', NEW.seuil_min, NEW.seuil_max;
  END IF;
  -- production rule required when lifespan involves production
  IF NEW.lifespan_mode IN ('production','mixte') AND NEW.production_rule IS NULL THEN
    RAISE EXCEPTION 'Une règle de calcul (production_rule) est requise quand lifespan_mode = %', NEW.lifespan_mode;
  END IF;
  -- active position must have a designation
  IF NEW.statut = 'active' AND (NEW.designation IS NULL OR length(btrim(NEW.designation)) = 0) THEN
    RAISE EXCEPTION 'Une position active doit avoir une désignation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdr_position_validate
BEFORE INSERT OR UPDATE ON public.pdr_install_positions
FOR EACH ROW EXECUTE FUNCTION public.tg_pdr_position_validate();

CREATE TRIGGER trg_pdr_position_updated_at
BEFORE UPDATE ON public.pdr_install_positions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Soft-delete enforcement: forbid physical DELETE if instances reference it
CREATE OR REPLACE FUNCTION public.tg_pdr_position_block_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pdr_instances WHERE position_id = OLD.id) THEN
    RAISE EXCEPTION 'Impossible de supprimer une position avec historique. Utilisez statut = supprimee.';
  END IF;
  RETURN OLD;
END;
$$;

-- ============================================================================
-- Extend pdr_instances with position tracking (additive, all nullable)
-- ============================================================================

ALTER TABLE public.pdr_instances
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.pdr_install_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compteur_pose_at numeric;

CREATE INDEX IF NOT EXISTS idx_pdr_instances_position ON public.pdr_instances(position_id);

-- Block hard-delete trigger (after column exists)
CREATE TRIGGER trg_pdr_position_block_delete
BEFORE DELETE ON public.pdr_install_positions
FOR EACH ROW EXECUTE FUNCTION public.tg_pdr_position_block_delete();

-- ============================================================================
-- get_position_counter(uuid) — encapsulates lifespan calculation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_position_counter(p_position_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos public.pdr_install_positions%ROWTYPE;
  v_link public.pdr_entity_links%ROWTYPE;
  v_machine_id uuid;
  v_line_id uuid;
  v_date_pose timestamptz;
  v_total_prod numeric := 0;
  v_active_count int := 1;
BEGIN
  SELECT * INTO v_pos FROM public.pdr_install_positions WHERE id = p_position_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Manual mode → return stored value
  IF v_pos.lifespan_mode = 'none' THEN RETURN 0; END IF;
  IF v_pos.production_rule = 'manuel' THEN RETURN COALESCE(v_pos.compteur_manuel, 0); END IF;
  IF v_pos.lifespan_mode = 'time' THEN
    -- Time mode: hours/days since last install (or position creation)
    SELECT MAX(date_installation) INTO v_date_pose
    FROM public.pdr_instances
    WHERE position_id = p_position_id AND statut = 'active';
    v_date_pose := COALESCE(v_date_pose, v_pos.created_at);
    RETURN EXTRACT(EPOCH FROM (now() - v_date_pose)) / 86400.0; -- jours
  END IF;

  -- Production-based modes
  SELECT * INTO v_link FROM public.pdr_entity_links WHERE id = v_pos.link_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Resolve line_id from machine
  IF v_link.entity_type = 'machine' THEN
    SELECT ligne_id INTO v_line_id FROM public.machines WHERE id = v_link.entity_id;
  ELSIF v_link.entity_type = 'equipement' THEN
    SELECT line_id INTO v_line_id FROM public.equipements WHERE id = v_link.entity_id;
  ELSIF v_link.entity_type = 'organe' THEN
    SELECT e.line_id INTO v_line_id
      FROM public.organes o JOIN public.equipements e ON e.id = o.equipement_id
     WHERE o.id = v_link.entity_id;
  END IF;

  IF v_line_id IS NULL THEN RETURN COALESCE(v_pos.compteur_manuel, 0); END IF;

  -- Date of last install on this position (or position creation)
  SELECT MAX(date_installation) INTO v_date_pose
    FROM public.pdr_instances
   WHERE position_id = p_position_id AND statut = 'active';
  v_date_pose := COALESCE(v_date_pose, v_pos.created_at);

  -- Sum production on this line since pose
  SELECT COALESCE(SUM(pd.quantite_produite), 0) INTO v_total_prod
    FROM public.production_declarations pd
    JOIN public.shifts s ON s.id = pd.shift_id
   WHERE s.line_id = v_line_id
     AND pd.heure_production >= v_date_pose;

  -- Apply rule
  IF v_pos.production_rule = 'complete' THEN
    RETURN v_total_prod;
  ELSIF v_pos.production_rule = 'reparti' THEN
    SELECT COUNT(*) INTO v_active_count
      FROM public.pdr_install_positions
     WHERE link_id = v_pos.link_id AND statut = 'active';
    IF v_active_count < 1 THEN v_active_count := 1; END IF;
    RETURN v_total_prod / v_active_count;
  ELSIF v_pos.production_rule = 'coefficient' THEN
    RETURN v_total_prod * COALESCE(v_pos.production_coefficient, 1);
  END IF;

  RETURN COALESCE(v_pos.compteur_manuel, 0);
END;
$$;

-- ============================================================================
-- View: pdr_position_status (computed read-only status per position)
-- ============================================================================

CREATE OR REPLACE VIEW public.pdr_position_status AS
SELECT
  p.id AS position_id,
  p.link_id,
  l.pdr_id,
  l.entity_type,
  l.entity_id,
  p.designation,
  p.statut,
  p.lifespan_mode,
  p.seuil_min,
  p.seuil_max,
  p.seuil_alerte_pct,
  p.unite_mesure,
  p.production_rule,
  p.production_coefficient,
  (SELECT pi.id FROM public.pdr_instances pi
    WHERE pi.position_id = p.id AND pi.statut = 'active'
    ORDER BY pi.date_installation DESC LIMIT 1) AS current_instance_id,
  (SELECT pi.date_installation FROM public.pdr_instances pi
    WHERE pi.position_id = p.id AND pi.statut = 'active'
    ORDER BY pi.date_installation DESC LIMIT 1) AS date_pose,
  (SELECT pi.date_installation FROM public.pdr_instances pi
    WHERE pi.position_id = p.id
    ORDER BY pi.date_installation DESC LIMIT 1) AS date_dernier_changement,
  (SELECT pi.ticket_id FROM public.pdr_instances pi
    WHERE pi.position_id = p.id AND pi.ticket_id IS NOT NULL
    ORDER BY pi.date_installation DESC LIMIT 1) AS last_ticket_id,
  public.get_position_counter(p.id) AS compteur_actuel,
  p.seuil_max AS compteur_max,
  CASE
    WHEN p.seuil_max IS NULL OR p.seuil_max = 0 THEN 0
    ELSE LEAST(100, GREATEST(0, (public.get_position_counter(p.id) / p.seuil_max) * 100))
  END AS pct_consomme,
  CASE
    WHEN p.seuil_max IS NULL OR p.seuil_max = 0 THEN NULL
    ELSE GREATEST(0, p.seuil_max - public.get_position_counter(p.id))
  END AS compteur_restant,
  CASE
    WHEN p.seuil_max IS NULL OR p.seuil_max = 0 THEN 'vert'
    WHEN public.get_position_counter(p.id) >= p.seuil_max THEN 'rouge'
    WHEN (public.get_position_counter(p.id) / p.seuil_max) * 100 >= COALESCE(p.seuil_alerte_pct, 80) THEN 'orange'
    ELSE 'vert'
  END AS niveau
FROM public.pdr_install_positions p
JOIN public.pdr_entity_links l ON l.id = p.link_id;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.pdr_install_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PDR positions viewable by authenticated"
  ON public.pdr_install_positions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Maintenance can manage pdr positions"
  ON public.pdr_install_positions FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'resp_maintenance'::app_role)
    OR has_role(auth.uid(), 'maintenancier'::app_role)
    OR has_role(auth.uid(), 'gestionnaire_magasin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'resp_maintenance'::app_role)
    OR has_role(auth.uid(), 'maintenancier'::app_role)
    OR has_role(auth.uid(), 'gestionnaire_magasin'::app_role)
  );
