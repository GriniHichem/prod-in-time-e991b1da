
-- Enums
DO $$ BEGIN CREATE TYPE public.inventory_campaign_status AS ENUM ('draft','en_cours','arbitrage','cloturee','annulee'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.inventory_assignment_role AS ENUM ('agent_a','agent_b','agent_c'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.inventory_target_status AS ENUM ('a_compter','en_arbitrage','conforme','a_recompter','cloture'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.inventory_decision AS ENUM ('en_attente','conforme_ab','conforme_c_eq_a','conforme_c_eq_b','recompte_ab'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.inventory_entity_type AS ENUM ('pdr','organe'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tables
CREATE TABLE IF NOT EXISTS public.inventory_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  label text NOT NULL,
  description text,
  status public.inventory_campaign_status NOT NULL DEFAULT 'draft',
  scope_pdr boolean NOT NULL DEFAULT true,
  scope_organes boolean NOT NULL DEFAULT false,
  date_debut date,
  date_fin_prevue date,
  date_cloture timestamptz,
  responsable_id uuid,
  created_by uuid,
  updated_by uuid,
  motif text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_campaign_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.inventory_campaigns(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.pdr_families(id) ON DELETE CASCADE,
  include_children boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, family_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.inventory_campaigns(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  role public.inventory_assignment_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, agent_id, role)
);

CREATE TABLE IF NOT EXISTS public.inventory_assignment_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.inventory_assignments(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.pdr_families(id) ON DELETE CASCADE,
  include_children boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, family_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.inventory_campaigns(id) ON DELETE CASCADE,
  entity_type public.inventory_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  entity_code text,
  entity_label text,
  family_id uuid REFERENCES public.pdr_families(id),
  qty_systeme numeric(18,4) NOT NULL DEFAULT 0,
  current_round int NOT NULL DEFAULT 1,
  status public.inventory_target_status NOT NULL DEFAULT 'a_compter',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS inventory_targets_campaign_status_idx ON public.inventory_targets(campaign_id, status);
CREATE INDEX IF NOT EXISTS inventory_targets_family_idx ON public.inventory_targets(family_id);

CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.inventory_targets(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.inventory_assignments(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  role public.inventory_assignment_role NOT NULL,
  round int NOT NULL DEFAULT 1,
  qty_comptee numeric(18,4) NOT NULL,
  notes text,
  validated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_id, assignment_id, round)
);
CREATE INDEX IF NOT EXISTS inventory_counts_target_idx ON public.inventory_counts(target_id);

CREATE TABLE IF NOT EXISTS public.inventory_results (
  target_id uuid PRIMARY KEY REFERENCES public.inventory_targets(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.inventory_campaigns(id) ON DELETE CASCADE,
  round int NOT NULL DEFAULT 1,
  qty_a numeric(18,4),
  qty_b numeric(18,4),
  qty_c numeric(18,4),
  ecart_ab numeric(18,4),
  ecart_ac numeric(18,4),
  ecart_bc numeric(18,4),
  qty_finale numeric(18,4),
  decision public.inventory_decision NOT NULL DEFAULT 'en_attente',
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at triggers
DROP TRIGGER IF EXISTS tg_inv_campaigns_uat ON public.inventory_campaigns;
CREATE TRIGGER tg_inv_campaigns_uat BEFORE UPDATE ON public.inventory_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS tg_inv_targets_uat ON public.inventory_targets;
CREATE TRIGGER tg_inv_targets_uat BEFORE UPDATE ON public.inventory_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS tg_inv_results_uat ON public.inventory_results;
CREATE TRIGGER tg_inv_results_uat BEFORE UPDATE ON public.inventory_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-numérotation
CREATE OR REPLACE FUNCTION public.tg_inventory_campaign_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_prefix text; v_seq int;
BEGIN
  IF NEW.code IS NOT NULL AND length(btrim(NEW.code)) > 0 THEN RETURN NEW; END IF;
  v_prefix := 'INV-' || to_char(now() AT TIME ZONE 'Africa/Algiers','YYYYMM') || '-';
  SELECT COALESCE(MAX(CAST(substring(code from length(v_prefix)+1) AS int)), 0) + 1
    INTO v_seq FROM public.inventory_campaigns WHERE code LIKE v_prefix || '%';
  NEW.code := v_prefix || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_inventory_campaign_code ON public.inventory_campaigns;
CREATE TRIGGER tg_inventory_campaign_code BEFORE INSERT ON public.inventory_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_inventory_campaign_code();

-- Verrouillage des counts
CREATE OR REPLACE FUNCTION public.tg_lock_inventory_counts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'Comptage verrouillé : modification/suppression interdite après validation';
END $$;
DROP TRIGGER IF EXISTS tg_lock_inventory_counts_upd ON public.inventory_counts;
CREATE TRIGGER tg_lock_inventory_counts_upd BEFORE UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.tg_lock_inventory_counts();
DROP TRIGGER IF EXISTS tg_lock_inventory_counts_del ON public.inventory_counts;
CREATE TRIGGER tg_lock_inventory_counts_del BEFORE DELETE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.tg_lock_inventory_counts();

-- Helpers
CREATE OR REPLACE FUNCTION public.inv_family_descendants(p_family_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = public AS $$
  WITH RECURSIVE t AS (
    SELECT id FROM public.pdr_families WHERE id = p_family_id
    UNION ALL
    SELECT f.id FROM public.pdr_families f JOIN t ON f.parent_id = t.id
  ) SELECT id FROM t;
$$;

CREATE OR REPLACE FUNCTION public.inv_assignment_authorized_families(p_assignment_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT s.family_id FROM public.inventory_assignment_scopes s
   WHERE s.assignment_id = p_assignment_id AND s.include_children = false
  UNION
  SELECT d FROM public.inventory_assignment_scopes s
    CROSS JOIN LATERAL public.inv_family_descendants(s.family_id) AS d
   WHERE s.assignment_id = p_assignment_id AND s.include_children = true;
$$;

CREATE OR REPLACE FUNCTION public.inv_campaign_authorized_families(p_campaign_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT s.family_id FROM public.inventory_campaign_scopes s
   WHERE s.campaign_id = p_campaign_id AND s.include_children = false
  UNION
  SELECT d FROM public.inventory_campaign_scopes s
    CROSS JOIN LATERAL public.inv_family_descendants(s.family_id) AS d
   WHERE s.campaign_id = p_campaign_id AND s.include_children = true;
$$;

-- Snapshot
CREATE OR REPLACE FUNCTION public.inv_ensure_targets(p_campaign_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_camp public.inventory_campaigns%ROWTYPE; v_count int := 0;
BEGIN
  SELECT * INTO v_camp FROM public.inventory_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campagne introuvable'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'responsable_inventaire'::app_role)
       OR v_camp.responsable_id = auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF v_camp.scope_pdr THEN
    INSERT INTO public.inventory_targets (campaign_id, entity_type, entity_id, entity_code, entity_label, family_id, qty_systeme)
    SELECT v_camp.id, 'pdr'::public.inventory_entity_type, p.id, p.reference, p.designation, p.famille_id, COALESCE(p.stock_actuel,0)
    FROM public.pdr p
    WHERE p.famille_id IN (SELECT public.inv_campaign_authorized_families(v_camp.id))
    ON CONFLICT (campaign_id, entity_type, entity_id) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  INSERT INTO public.inventory_results (target_id, campaign_id, round)
  SELECT t.id, t.campaign_id, t.current_round
  FROM public.inventory_targets t
  WHERE t.campaign_id = v_camp.id
  ON CONFLICT (target_id) DO NOTHING;

  RETURN v_count;
END $$;

-- Recompute decision tree
CREATE OR REPLACE FUNCTION public.inv_recompute_result(p_target_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target public.inventory_targets%ROWTYPE;
  v_a numeric; v_b numeric; v_c numeric;
  v_decision public.inventory_decision := 'en_attente';
  v_qty_finale numeric := NULL;
  v_status public.inventory_target_status;
BEGIN
  SELECT * INTO v_target FROM public.inventory_targets WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT qty_comptee INTO v_a FROM public.inventory_counts WHERE target_id = p_target_id AND role = 'agent_a' AND round = v_target.current_round;
  SELECT qty_comptee INTO v_b FROM public.inventory_counts WHERE target_id = p_target_id AND role = 'agent_b' AND round = v_target.current_round;
  SELECT qty_comptee INTO v_c FROM public.inventory_counts WHERE target_id = p_target_id AND role = 'agent_c' AND round = v_target.current_round;

  IF v_a IS NOT NULL AND v_b IS NOT NULL THEN
    IF v_a = v_b THEN
      v_decision := 'conforme_ab'; v_qty_finale := v_a; v_status := 'conforme';
    ELSE
      IF v_c IS NULL THEN
        v_decision := 'en_attente'; v_status := 'en_arbitrage';
      ELSIF v_c = v_a THEN
        v_decision := 'conforme_c_eq_a'; v_qty_finale := v_c; v_status := 'conforme';
      ELSIF v_c = v_b THEN
        v_decision := 'conforme_c_eq_b'; v_qty_finale := v_c; v_status := 'conforme';
      ELSE
        v_decision := 'recompte_ab'; v_status := 'a_recompter';
        UPDATE public.inventory_targets SET current_round = current_round + 1, status = 'a_recompter'
         WHERE id = p_target_id;
      END IF;
    END IF;
  ELSE
    v_status := 'a_compter';
  END IF;

  INSERT INTO public.inventory_results (target_id, campaign_id, round, qty_a, qty_b, qty_c,
       ecart_ab, ecart_ac, ecart_bc, qty_finale, decision, decided_at)
  VALUES (p_target_id, v_target.campaign_id, v_target.current_round, v_a, v_b, v_c,
          CASE WHEN v_a IS NOT NULL AND v_b IS NOT NULL THEN abs(v_a - v_b) END,
          CASE WHEN v_a IS NOT NULL AND v_c IS NOT NULL THEN abs(v_a - v_c) END,
          CASE WHEN v_b IS NOT NULL AND v_c IS NOT NULL THEN abs(v_b - v_c) END,
          v_qty_finale, v_decision,
          CASE WHEN v_decision IN ('conforme_ab','conforme_c_eq_a','conforme_c_eq_b') THEN now() END)
  ON CONFLICT (target_id) DO UPDATE SET
    round = EXCLUDED.round, qty_a = EXCLUDED.qty_a, qty_b = EXCLUDED.qty_b, qty_c = EXCLUDED.qty_c,
    ecart_ab = EXCLUDED.ecart_ab, ecart_ac = EXCLUDED.ecart_ac, ecart_bc = EXCLUDED.ecart_bc,
    qty_finale = EXCLUDED.qty_finale, decision = EXCLUDED.decision,
    decided_at = EXCLUDED.decided_at, updated_at = now();

  IF v_status IS NOT NULL AND v_status <> 'a_recompter' THEN
    UPDATE public.inventory_targets SET status = v_status WHERE id = p_target_id;
  END IF;
END $$;

-- RPC enregistrement comptage
CREATE OR REPLACE FUNCTION public.inv_register_count(
  p_target_id uuid, p_qty numeric, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.inventory_targets%ROWTYPE;
  v_campaign public.inventory_campaigns%ROWTYPE;
  v_assignment public.inventory_assignments%ROWTYPE;
  v_count_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  IF p_qty IS NULL OR p_qty < 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;

  SELECT * INTO v_target FROM public.inventory_targets WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target introuvable'; END IF;

  SELECT * INTO v_campaign FROM public.inventory_campaigns WHERE id = v_target.campaign_id;
  IF v_campaign.status NOT IN ('en_cours','arbitrage') THEN
    RAISE EXCEPTION 'Campagne non ouverte au comptage';
  END IF;

  SELECT * INTO v_assignment FROM public.inventory_assignments
   WHERE campaign_id = v_target.campaign_id AND agent_id = v_uid AND is_active = true
   ORDER BY CASE role WHEN 'agent_c' THEN 0 WHEN 'agent_a' THEN 1 ELSE 2 END
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vous n''êtes pas affecté à cette campagne'; END IF;

  IF v_assignment.role <> 'agent_c' THEN
    IF v_target.family_id IS NULL OR
       v_target.family_id NOT IN (SELECT public.inv_assignment_authorized_families(v_assignment.id)) THEN
      RAISE EXCEPTION 'Article hors de votre périmètre autorisé';
    END IF;
  END IF;

  IF v_target.status IN ('cloture','conforme') THEN
    RAISE EXCEPTION 'Article déjà clôturé / conforme';
  END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_counts
              WHERE target_id = p_target_id AND assignment_id = v_assignment.id
                AND round = v_target.current_round) THEN
    RAISE EXCEPTION 'Vous avez déjà validé ce comptage (verrouillé)';
  END IF;

  INSERT INTO public.inventory_counts (target_id, assignment_id, agent_id, role, round, qty_comptee, notes)
  VALUES (p_target_id, v_assignment.id, v_uid, v_assignment.role, v_target.current_round, p_qty, p_notes)
  RETURNING id INTO v_count_id;

  PERFORM public.inv_recompute_result(p_target_id);
  RETURN v_count_id;
END $$;

-- Ouverture / clôture
CREATE OR REPLACE FUNCTION public.inv_open_campaign(p_campaign_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'responsable_inventaire'::app_role)) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  PERFORM public.inv_ensure_targets(p_campaign_id);
  UPDATE public.inventory_campaigns
     SET status = 'en_cours', date_debut = COALESCE(date_debut, current_date), updated_by = auth.uid()
   WHERE id = p_campaign_id;
END $$;

CREATE OR REPLACE FUNCTION public.inv_close_campaign(p_campaign_id uuid, p_motif text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pending int;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'responsable_inventaire'::app_role)) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  SELECT count(*) INTO v_pending FROM public.inventory_targets
   WHERE campaign_id = p_campaign_id AND status NOT IN ('conforme','cloture');
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Impossible de clôturer : % articles encore non conformes', v_pending;
  END IF;
  UPDATE public.inventory_targets SET status = 'cloture'
   WHERE campaign_id = p_campaign_id AND status = 'conforme';
  UPDATE public.inventory_campaigns
     SET status = 'cloturee', date_cloture = now(), motif = COALESCE(p_motif, motif), updated_by = auth.uid()
   WHERE id = p_campaign_id;
END $$;

-- Restreindre l'exécution aux utilisateurs authentifiés
REVOKE EXECUTE ON FUNCTION public.inv_register_count(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inv_open_campaign(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inv_close_campaign(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inv_ensure_targets(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inv_recompute_result(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_register_count(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_open_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_close_campaign(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_ensure_targets(uuid) TO authenticated;

-- RLS
ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_campaign_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_assignment_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_camp_manage ON public.inventory_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role));
CREATE POLICY inv_camp_read_assigned ON public.inventory_campaigns
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventory_assignments a
                 WHERE a.campaign_id = inventory_campaigns.id AND a.agent_id = auth.uid()));

CREATE POLICY inv_cs_manage ON public.inventory_campaign_scopes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role));

CREATE POLICY inv_as_manage ON public.inventory_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role));
CREATE POLICY inv_as_self_read ON public.inventory_assignments
  FOR SELECT TO authenticated USING (agent_id = auth.uid());

CREATE POLICY inv_ass_scopes_manage ON public.inventory_assignment_scopes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role));
CREATE POLICY inv_ass_scopes_self_read ON public.inventory_assignment_scopes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventory_assignments a
                 WHERE a.id = inventory_assignment_scopes.assignment_id AND a.agent_id = auth.uid()));

CREATE POLICY inv_targets_manage ON public.inventory_targets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role));
CREATE POLICY inv_targets_assigned_read ON public.inventory_targets
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventory_assignments a
                 WHERE a.campaign_id = inventory_targets.campaign_id AND a.agent_id = auth.uid()));

CREATE POLICY inv_counts_resp_read ON public.inventory_counts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role));
CREATE POLICY inv_counts_self_read ON public.inventory_counts
  FOR SELECT TO authenticated USING (agent_id = auth.uid());

CREATE POLICY inv_results_resp_read ON public.inventory_results
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'responsable_inventaire'::app_role));
CREATE POLICY inv_results_agent_read ON public.inventory_results
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventory_assignments a
                 WHERE a.campaign_id = inventory_results.campaign_id AND a.agent_id = auth.uid()));
