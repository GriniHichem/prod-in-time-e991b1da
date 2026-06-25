-- 1. Étendre le garde-fou pour exiger le flag métier sur les sorties ad-hoc
CREATE OR REPLACE FUNCTION public.guard_pdr_stock_movements()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.source_type IN ('ticket', 'preventive_execution') THEN
    RAISE EXCEPTION 'Sortie PDR directe interdite : passez par le circuit de demande de pièces.';
  END IF;
  IF NEW.source_type IN ('pdr_request', 'pdr_adhoc')
     AND coalesce(current_setting('app.pdr_flow', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Mouvement PDR interdit hors fonction métier.';
  END IF;
  RETURN NEW;
END $$;

-- 2. RPC : consommation directe d'une pièce non planifiée sur une exécution préventive
CREATE OR REPLACE FUNCTION public.consume_adhoc_pdr_preventive(
  p_execution_id uuid, p_pdr_id uuid, p_qte integer,
  p_position_id uuid DEFAULT NULL, p_cause text DEFAULT NULL, p_commentaire text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_exec public.preventive_executions; v_pdr public.pdr; v_avant int; v_apres int;
BEGIN
  IF NOT (has_role(auth.uid(),'maintenancier') OR has_role(auth.uid(),'resp_maintenance') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Permission refusée';
  END IF;
  IF p_execution_id IS NULL THEN RAISE EXCEPTION 'Exécution préventive requise'; END IF;
  IF p_pdr_id IS NULL THEN RAISE EXCEPTION 'Pièce requise'; END IF;
  IF p_qte < 1 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;

  SELECT * INTO v_exec FROM public.preventive_executions WHERE id=p_execution_id FOR UPDATE;
  IF v_exec.id IS NULL THEN RAISE EXCEPTION 'Exécution introuvable'; END IF;
  IF NOT (v_exec.executed_by = auth.uid() OR has_role(auth.uid(),'resp_maintenance') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Seul l''intervenant peut consommer des pièces sur cette exécution';
  END IF;

  SELECT * INTO v_pdr FROM public.pdr WHERE id=p_pdr_id FOR UPDATE;
  IF v_pdr.id IS NULL THEN RAISE EXCEPTION 'Pièce introuvable'; END IF;
  IF v_pdr.stock_actuel < p_qte THEN
    RAISE EXCEPTION 'Stock insuffisant (disponible: %, demandé: %)', v_pdr.stock_actuel, p_qte;
  END IF;

  PERFORM set_config('app.pdr_flow', 'on', true);

  INSERT INTO public.intervention_pdr(preventive_execution_id, pdr_id, quantite, position_id, cause_remplacement, commentaire_technique)
  VALUES (p_execution_id, p_pdr_id, p_qte, p_position_id, coalesce(p_cause, 'preventif'), p_commentaire);

  v_avant := v_pdr.stock_actuel; v_apres := v_avant - p_qte;
  UPDATE public.pdr SET stock_actuel = v_apres WHERE id=p_pdr_id;
  INSERT INTO public.pdr_stock_movements(pdr_id, type, quantite, stock_avant, stock_apres,
    prix_unitaire, source_type, source_id, motif, user_id, applied, validation_status)
  VALUES (p_pdr_id, 'sortie', p_qte, v_avant, v_apres, v_pdr.pmp,
    'pdr_adhoc', p_execution_id, 'Consommation directe (non planifiée) — intervention préventive', auth.uid(), true, 'applied');
END $$;

GRANT EXECUTE ON FUNCTION public.consume_adhoc_pdr_preventive(uuid, uuid, integer, uuid, text, text) TO authenticated;