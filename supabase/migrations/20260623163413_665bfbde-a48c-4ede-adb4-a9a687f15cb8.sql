
-- =========================================================
-- 1. GUARD: transaction-local flag set by business functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.guard_intervention_pdr()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(current_setting('app.pdr_flow', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Consommation PDR interdite hors du circuit de demande validé (intervention_pdr). Utilisez Demander / prendre des pièces.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_intervention_pdr ON public.intervention_pdr;
CREATE TRIGGER trg_guard_intervention_pdr
  BEFORE INSERT OR UPDATE ON public.intervention_pdr
  FOR EACH ROW EXECUTE FUNCTION public.guard_intervention_pdr();

CREATE OR REPLACE FUNCTION public.guard_pdr_stock_movements()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  -- Legacy direct bypass from tickets / preventive exec is forbidden
  IF NEW.source_type IN ('ticket', 'preventive_execution') THEN
    RAISE EXCEPTION 'Sortie PDR directe interdite : passez par le circuit de demande de pièces.';
  END IF;
  -- Request-linked movements only via the official take/consume functions
  IF NEW.source_type = 'pdr_request'
     AND coalesce(current_setting('app.pdr_flow', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Mouvement PDR de demande interdit hors fonction métier.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_pdr_stock_movements ON public.pdr_stock_movements;
CREATE TRIGGER trg_guard_pdr_stock_movements
  BEFORE INSERT ON public.pdr_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_pdr_stock_movements();

-- =========================================================
-- 2. HARDEN: set_request_item_ready (magasin)
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_request_item_ready(
  p_item_id uuid, p_qte integer DEFAULT NULL, p_comment text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_item public.pdr_request_items; v_qte int; v_req public.pdr_requests; v_pdr public.pdr;
BEGIN
  IF NOT (has_role(auth.uid(),'gestionnaire_magasin') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Permission refusée: réservé au magasin';
  END IF;
  SELECT * INTO v_item FROM public.pdr_request_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Ligne introuvable'; END IF;
  IF v_item.statut <> 'demandee' THEN RAISE EXCEPTION 'Ligne non modifiable (statut %)', v_item.statut; END IF;
  v_qte := COALESCE(p_qte, v_item.quantite_demandee);
  IF v_qte <= 0 THEN RAISE EXCEPTION 'Quantité préparée invalide'; END IF;
  IF v_qte > v_item.quantite_demandee THEN
    RAISE EXCEPTION 'Quantité préparée (%) supérieure à la quantité demandée (%)', v_qte, v_item.quantite_demandee;
  END IF;

  SELECT * INTO v_pdr FROM public.pdr WHERE id = v_item.pdr_id FOR UPDATE;
  IF v_qte > v_pdr.stock_actuel THEN
    RAISE EXCEPTION 'Stock physique insuffisant (dispo %, demandé préparé %)', v_pdr.stock_actuel, v_qte;
  END IF;

  UPDATE public.pdr_request_items
    SET statut='prete', quantite_preparee=v_qte, prepared_by=auth.uid(), prepared_at=now(),
        commentaire=COALESCE(p_comment, commentaire)
  WHERE id=p_item_id;

  SELECT * INTO v_req FROM public.pdr_requests WHERE id=v_item.request_id;
  PERFORM public.pdr_request_audit('update', p_item_id, 'Pièce préparée '||COALESCE(v_pdr.reference,''),
    jsonb_build_object('statut','demandee'), jsonb_build_object('statut','prete','quantite_preparee',v_qte));

  INSERT INTO public.notifications(title, message, notification_type, module, severity, status, source, is_critical,
    entity_type, entity_id, entity_label, recipient_user_id, action_url)
  VALUES ('Pièce prête à prendre',
    'La pièce '||COALESCE(v_pdr.reference,'')||' de la demande '||v_req.numero||' est prête.',
    'pdr_request_ready','pdr','info','unread','app',false,
    'pdr_request', v_req.id, v_req.numero, v_req.requested_by, '/maintenance/shift');
END $$;

-- =========================================================
-- 3. HARDEN: confirm_request_item_taken (maintenance)
-- =========================================================
CREATE OR REPLACE FUNCTION public.confirm_request_item_taken(
  p_item_id uuid, p_qte integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_item public.pdr_request_items; v_req public.pdr_requests; v_pdr public.pdr;
  v_qte int; v_avant int; v_apres int; v_holding uuid;
BEGIN
  IF NOT (has_role(auth.uid(),'maintenancier') OR has_role(auth.uid(),'resp_maintenance') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Permission refusée: réservé à la maintenance';
  END IF;
  SELECT * INTO v_item FROM public.pdr_request_items WHERE id=p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Ligne introuvable'; END IF;
  IF v_item.statut <> 'prete' THEN RAISE EXCEPTION 'La pièce doit être préparée par le magasin avant la prise'; END IF;

  v_qte := COALESCE(p_qte, v_item.quantite_preparee, v_item.quantite_demandee);
  IF v_qte <= 0 THEN RAISE EXCEPTION 'Quantité prise invalide'; END IF;
  IF v_qte > COALESCE(v_item.quantite_preparee, v_item.quantite_demandee) THEN
    RAISE EXCEPTION 'Quantité prise (%) supérieure à la quantité préparée (%)', v_qte, COALESCE(v_item.quantite_preparee, v_item.quantite_demandee);
  END IF;

  SELECT * INTO v_pdr FROM public.pdr WHERE id=v_item.pdr_id FOR UPDATE;
  v_avant := v_pdr.stock_actuel;
  IF v_qte > v_avant THEN
    RAISE EXCEPTION 'Stock physique insuffisant (dispo %, prise demandée %)', v_avant, v_qte;
  END IF;
  v_apres := v_avant - v_qte;

  -- allow the guarded inserts below
  PERFORM set_config('app.pdr_flow', 'on', true);

  -- release reservation (full requested qty) + decrement actual stock
  UPDATE public.pdr
    SET stock_reserve = GREATEST(0, stock_reserve - v_item.quantite_demandee),
        stock_actuel = v_apres
  WHERE id=v_item.pdr_id;

  SELECT * INTO v_req FROM public.pdr_requests WHERE id=v_item.request_id;

  INSERT INTO public.pdr_stock_movements(pdr_id, type, quantite, stock_avant, stock_apres,
    prix_unitaire, source_type, source_id, motif, user_id, applied, validation_status)
  VALUES (v_item.pdr_id, 'sortie', v_qte, v_avant, v_apres, v_pdr.pmp,
    'pdr_request', v_req.id, 'Prise pièce demande '||v_req.numero, auth.uid(), true, 'applied');

  INSERT INTO public.pdr_maintenance_holdings(pdr_id, request_item_id, holder_id, quantite, statut, intervention_id)
  VALUES (v_item.pdr_id, p_item_id, auth.uid(), v_qte, 'en_main', v_req.intervention_id)
  RETURNING id INTO v_holding;

  UPDATE public.pdr_request_items
    SET statut='prise', quantite_prise=v_qte, taken_by=auth.uid(), taken_at=now()
  WHERE id=p_item_id;

  PERFORM public.pdr_request_audit('update', p_item_id, 'Pièce prise '||COALESCE(v_pdr.reference,''),
    jsonb_build_object('statut','prete','stock_actuel',v_avant),
    jsonb_build_object('statut','prise','quantite_prise',v_qte,'stock_actuel',v_apres));

  INSERT INTO public.notifications(title, message, notification_type, module, severity, status, source, is_critical,
    entity_type, entity_id, entity_label, recipient_role, action_url)
  VALUES ('Pièce remise à la maintenance',
    'La pièce '||COALESCE(v_pdr.reference,'')||' ('||v_req.numero||') a été prise par la maintenance.',
    'pdr_request_taken','pdr','info','unread','app',false,
    'pdr_request', v_req.id, v_req.numero, 'gestionnaire_magasin', '/pdr/demandes');

  RETURN v_holding;
END $$;

-- =========================================================
-- 4. HARDEN: consume_maintenance_holding (maintenance)
-- =========================================================
CREATE OR REPLACE FUNCTION public.consume_maintenance_holding(
  p_holding_id uuid, p_intervention_id uuid, p_qte_consomme integer,
  p_position_id uuid DEFAULT NULL, p_cause text DEFAULT NULL, p_commentaire text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_h public.pdr_maintenance_holdings; v_leftover int; v_pdr public.pdr; v_avant int; v_apres int;
BEGIN
  IF NOT (has_role(auth.uid(),'maintenancier') OR has_role(auth.uid(),'resp_maintenance') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Permission refusée';
  END IF;
  SELECT * INTO v_h FROM public.pdr_maintenance_holdings WHERE id=p_holding_id FOR UPDATE;
  IF v_h.id IS NULL THEN RAISE EXCEPTION 'Stock maintenance introuvable'; END IF;
  IF v_h.statut <> 'en_main' THEN RAISE EXCEPTION 'Déjà traité'; END IF;
  -- holding must originate from a validated request take
  IF v_h.request_item_id IS NULL THEN
    RAISE EXCEPTION 'Stock maintenance non rattaché à une demande validée';
  END IF;
  -- only the holder (or a responsable) can consume
  IF NOT (v_h.holder_id = auth.uid() OR has_role(auth.uid(),'resp_maintenance') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Seul le détenteur de la pièce peut la consommer';
  END IF;
  IF p_qte_consomme < 0 OR p_qte_consomme > v_h.quantite THEN RAISE EXCEPTION 'Quantité consommée invalide'; END IF;

  -- allow the guarded inserts below
  PERFORM set_config('app.pdr_flow', 'on', true);

  IF p_qte_consomme > 0 THEN
    INSERT INTO public.intervention_pdr(intervention_id, pdr_id, quantite, position_id, cause_remplacement, commentaire_technique)
    VALUES (p_intervention_id, v_h.pdr_id, p_qte_consomme, p_position_id, p_cause, p_commentaire);
  END IF;

  v_leftover := v_h.quantite - p_qte_consomme;
  IF v_leftover > 0 THEN
    SELECT * INTO v_pdr FROM public.pdr WHERE id=v_h.pdr_id FOR UPDATE;
    v_avant := v_pdr.stock_actuel; v_apres := v_avant + v_leftover;
    UPDATE public.pdr SET stock_actuel = v_apres WHERE id=v_h.pdr_id;
    INSERT INTO public.pdr_stock_movements(pdr_id, type, quantite, stock_avant, stock_apres,
      prix_unitaire, source_type, source_id, motif, user_id, applied, validation_status)
    VALUES (v_h.pdr_id, 'entree', v_leftover, v_avant, v_apres, v_pdr.pmp,
      'pdr_request', v_h.request_item_id, 'Retour reliquat stock maintenance', auth.uid(), true, 'applied');
  END IF;

  UPDATE public.pdr_maintenance_holdings
    SET statut='consomme', intervention_id=p_intervention_id, quantite=GREATEST(p_qte_consomme,0)
  WHERE id=p_holding_id;
END $$;

-- =========================================================
-- 5. TIGHTEN RLS: remove direct write paths
-- =========================================================
-- intervention_pdr: no direct client writes (only via guarded function)
DROP POLICY IF EXISTS "Maintenance can manage intervention PDR" ON public.intervention_pdr;
CREATE POLICY "Intervention PDR no direct writes" ON public.intervention_pdr
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- pdr_maintenance_holdings: read-only for clients; writes via functions only
DROP POLICY IF EXISTS "admin manage holdings" ON public.pdr_maintenance_holdings;

-- pdr_request_items: forbid direct status flips to prete/prise/refusee via API
DROP POLICY IF EXISTS "maintenance update pdr_request_items" ON public.pdr_request_items;

-- pdr_requests: keep create + cancel-via-function; drop broad direct update
DROP POLICY IF EXISTS "maintenance update own pdr_requests" ON public.pdr_requests;
