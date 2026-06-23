CREATE OR REPLACE FUNCTION public.consume_from_ministock(
  p_holding_id uuid, p_intervention_id uuid, p_qte_consomme integer,
  p_position_id uuid DEFAULT NULL, p_cause text DEFAULT NULL, p_commentaire text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_h public.pdr_maintenance_holdings; v_reste int;
BEGIN
  IF NOT (has_role(auth.uid(),'maintenancier') OR has_role(auth.uid(),'resp_maintenance') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Permission refusée';
  END IF;
  SELECT * INTO v_h FROM public.pdr_maintenance_holdings WHERE id=p_holding_id FOR UPDATE;
  IF v_h.id IS NULL THEN RAISE EXCEPTION 'Stock maintenance introuvable'; END IF;
  IF v_h.statut <> 'en_main' THEN RAISE EXCEPTION 'Déjà traité'; END IF;
  IF v_h.request_item_id IS NULL THEN
    RAISE EXCEPTION 'Stock maintenance non rattaché à une demande validée';
  END IF;
  IF NOT (v_h.holder_id = auth.uid() OR has_role(auth.uid(),'resp_maintenance') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Seul le détenteur de la pièce peut la consommer';
  END IF;
  IF p_qte_consomme < 1 OR p_qte_consomme > v_h.quantite THEN RAISE EXCEPTION 'Quantité consommée invalide'; END IF;

  -- allow the guarded insert below
  PERFORM set_config('app.pdr_flow', 'on', true);

  INSERT INTO public.intervention_pdr(intervention_id, pdr_id, quantite, position_id, cause_remplacement, commentaire_technique)
  VALUES (p_intervention_id, v_h.pdr_id, p_qte_consomme, p_position_id, p_cause, p_commentaire);

  v_reste := v_h.quantite - p_qte_consomme;

  -- Decrement the mini-stock; leftover stays held for other tickets. NO return to magasin.
  IF v_reste > 0 THEN
    UPDATE public.pdr_maintenance_holdings
      SET quantite = v_reste
    WHERE id = p_holding_id;
  ELSE
    UPDATE public.pdr_maintenance_holdings
      SET statut='consomme', intervention_id=p_intervention_id, quantite=0
    WHERE id = p_holding_id;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.consume_from_ministock(uuid, uuid, integer, uuid, text, text) TO authenticated;