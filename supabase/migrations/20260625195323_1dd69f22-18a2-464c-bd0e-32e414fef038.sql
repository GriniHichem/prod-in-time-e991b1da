
-- 1. Table des sessions d'action commune
CREATE TABLE public.preventive_action_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.preventive_plans(id) ON DELETE CASCADE,
  echeance_cible timestamptz,
  statut text NOT NULL DEFAULT 'en_cours',
  opened_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  reopened_by uuid,
  reopened_at timestamptz,
  reopen_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preventive_action_sessions TO authenticated;
GRANT ALL ON public.preventive_action_sessions TO service_role;

ALTER TABLE public.preventive_action_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Action sessions viewable by authenticated"
  ON public.preventive_action_sessions FOR SELECT USING (true);

CREATE POLICY "Maintenance can manage action sessions"
  ON public.preventive_action_sessions FOR ALL
  USING (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'resp_maintenance') OR
    has_role(auth.uid(), 'maintenancier')
  );

-- une seule session non terminée par plan
CREATE UNIQUE INDEX uniq_open_session_per_plan
  ON public.preventive_action_sessions (plan_id)
  WHERE statut = 'en_cours';

CREATE TRIGGER trg_action_sessions_updated_at
  BEFORE UPDATE ON public.preventive_action_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Lien contribution -> session
ALTER TABLE public.preventive_executions
  ADD COLUMN session_id uuid REFERENCES public.preventive_action_sessions(id) ON DELETE SET NULL;

-- 3. Realtime
ALTER TABLE public.preventive_action_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.preventive_action_sessions;

-- 4. Fonction : démarrer ou rejoindre l'action commune
CREATE OR REPLACE FUNCTION public.start_or_join_preventive_action(p_plan_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan public.preventive_plans%ROWTYPE;
  v_is_assignee boolean;
  v_session_id uuid;
  v_exec_id uuid;
  v_last_closed public.preventive_action_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT * INTO v_plan FROM public.preventive_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan introuvable';
  END IF;
  IF v_plan.statut_plan <> 'valide' THEN
    RAISE EXCEPTION 'Le plan doit être validé pour démarrer une intervention';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.preventive_plan_assignees
    WHERE plan_id = p_plan_id AND user_id = v_uid
  ) INTO v_is_assignee;

  IF NOT (v_is_assignee OR has_role(v_uid, 'admin') OR has_role(v_uid, 'resp_maintenance')) THEN
    RAISE EXCEPTION 'Vous n''êtes pas affecté à ce plan';
  END IF;

  -- session ouverte existante ?
  SELECT id INTO v_session_id
  FROM public.preventive_action_sessions
  WHERE plan_id = p_plan_id AND statut = 'en_cours'
  LIMIT 1;

  IF v_session_id IS NULL THEN
    -- verrou : dernière session terminée + échéance non atteinte
    SELECT * INTO v_last_closed
    FROM public.preventive_action_sessions
    WHERE plan_id = p_plan_id AND statut = 'terminee'
    ORDER BY closed_at DESC NULLS LAST
    LIMIT 1;

    IF FOUND AND v_plan.prochaine_echeance IS NOT NULL
       AND v_plan.prochaine_echeance > now()
       AND NOT (has_role(v_uid, 'admin') OR has_role(v_uid, 'resp_maintenance')) THEN
      RAISE EXCEPTION 'Action déjà clôturée. Prochaine intervention le %', to_char(v_plan.prochaine_echeance, 'DD/MM/YYYY');
    END IF;

    INSERT INTO public.preventive_action_sessions (plan_id, echeance_cible, opened_by)
    VALUES (p_plan_id, v_plan.prochaine_echeance, v_uid)
    RETURNING id INTO v_session_id;
  END IF;

  -- contribution en cours du user ?
  SELECT id INTO v_exec_id
  FROM public.preventive_executions
  WHERE session_id = v_session_id AND executed_by = v_uid AND statut = 'en_cours'
  LIMIT 1;

  IF v_exec_id IS NULL THEN
    INSERT INTO public.preventive_executions (plan_id, session_id, executed_by, statut, heure_debut)
    VALUES (p_plan_id, v_session_id, v_uid, 'en_cours', now())
    RETURNING id INTO v_exec_id;
  END IF;

  RETURN v_exec_id;
END;
$$;

-- 5. Fonction : clôturer l'action commune
CREATE OR REPLACE FUNCTION public.close_preventive_action(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.preventive_action_sessions%ROWTYPE;
  v_is_assignee boolean;
  v_plan public.preventive_plans%ROWTYPE;
  v_days int;
  v_next timestamptz;
BEGIN
  SELECT * INTO v_session FROM public.preventive_action_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_session.statut = 'terminee' THEN RETURN; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.preventive_plan_assignees
    WHERE plan_id = v_session.plan_id AND user_id = v_uid
  ) INTO v_is_assignee;

  IF NOT (v_is_assignee OR has_role(v_uid, 'admin') OR has_role(v_uid, 'resp_maintenance')) THEN
    RAISE EXCEPTION 'Non autorisé à clôturer cette action';
  END IF;

  -- clôturer les contributions encore ouvertes
  UPDATE public.preventive_executions
  SET statut = 'terminee', heure_fin = COALESCE(heure_fin, now())
  WHERE session_id = p_session_id AND statut = 'en_cours';

  UPDATE public.preventive_action_sessions
  SET statut = 'terminee', closed_by = v_uid, closed_at = now()
  WHERE id = p_session_id;

  SELECT * INTO v_plan FROM public.preventive_plans WHERE id = v_session.plan_id;
  v_days := CASE v_plan.frequence
    WHEN 'quotidien' THEN 1 WHEN 'hebdomadaire' THEN 7 WHEN 'bimensuel' THEN 14
    WHEN 'mensuel' THEN 30 WHEN 'trimestriel' THEN 90 WHEN 'semestriel' THEN 180
    WHEN 'annuel' THEN 365 ELSE 30 END;
  v_next := now() + (v_days || ' days')::interval;

  UPDATE public.preventive_plans
  SET derniere_execution = now(), prochaine_echeance = v_next
  WHERE id = v_session.plan_id;
END;
$$;

-- 6. Fonction : rouvrir une action verrouillée (responsable)
CREATE OR REPLACE FUNCTION public.reopen_preventive_action(p_plan_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session_id uuid;
BEGIN
  IF NOT (has_role(v_uid, 'admin') OR has_role(v_uid, 'resp_maintenance')) THEN
    RAISE EXCEPTION 'Réservé au responsable maintenance';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Motif de déblocage obligatoire';
  END IF;

  -- s'il existe déjà une session ouverte, la renvoyer
  SELECT id INTO v_session_id
  FROM public.preventive_action_sessions
  WHERE plan_id = p_plan_id AND statut = 'en_cours' LIMIT 1;

  IF v_session_id IS NULL THEN
    INSERT INTO public.preventive_action_sessions (plan_id, opened_by, reopened_by, reopened_at, reopen_reason)
    VALUES (p_plan_id, v_uid, v_uid, now(), p_reason)
    RETURNING id INTO v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$;
