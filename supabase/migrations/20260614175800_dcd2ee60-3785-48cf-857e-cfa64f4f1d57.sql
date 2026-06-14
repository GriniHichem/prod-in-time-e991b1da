-- 1. Scoped shift context helper (variant of get_active_shift_context with scope filter + line_ids)
CREATE OR REPLACE FUNCTION public.get_scope_shift_context(_user_id uuid, _scope text, _at timestamp with time zone DEFAULT now())
RETURNS TABLE(
  team_id uuid,
  template_id uuid,
  template_code text,
  heure_debut timestamp with time zone,
  heure_fin timestamp with time zone,
  line_ids uuid[],
  is_on_shift boolean,
  autorisation_libre boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (_at AT TIME ZONE 'Africa/Algiers')::date;
BEGIN
  RETURN QUERY
  WITH candidate_dates AS (
    SELECT v_today AS d
    UNION ALL
    SELECT v_today - 1
  ),
  rows AS (
    SELECT
      t.id AS team_id,
      tpl.id AS template_id,
      tpl.code AS template_code,
      ((cd.d + tpl.heure_debut) AT TIME ZONE 'Africa/Algiers') AS h_debut,
      ((CASE WHEN tpl.crosses_midnight THEN cd.d + 1 ELSE cd.d END + tpl.heure_fin) AT TIME ZONE 'Africa/Algiers') AS h_fin,
      sc.line_ids AS line_ids,
      stm.autorisation_libre AS autorisation_libre
    FROM public.shift_team_members stm
    JOIN public.shift_teams t ON t.id = stm.team_id AND t.is_active
    JOIN public.shift_schedules sc ON sc.team_id = t.id AND sc.is_active
    JOIN public.shift_templates tpl ON tpl.id = sc.template_id AND tpl.is_active
    CROSS JOIN candidate_dates cd
    WHERE stm.user_id = _user_id
      AND stm.is_active
      AND (sc.scope_kind = _scope OR sc.scope_kind = 'all')
      AND cd.d >= sc.date_debut
      AND (sc.date_fin IS NULL OR cd.d <= sc.date_fin)
      AND (array_length(sc.weekdays, 1) IS NULL
           OR EXTRACT(ISODOW FROM cd.d)::smallint = ANY(sc.weekdays))
  )
  SELECT
    r.team_id, r.template_id, r.template_code,
    r.h_debut, r.h_fin, r.line_ids,
    (_at >= r.h_debut AND _at < r.h_fin) AS is_on_shift,
    r.autorisation_libre
  FROM rows r
  ORDER BY
    (_at >= r.h_debut AND _at < r.h_fin) DESC,
    CASE WHEN r.h_debut >= _at THEN r.h_debut END ASC NULLS LAST,
    r.h_debut DESC
  LIMIT 1;
END;
$function$;

-- 2. Rewrite open_my_work_session to open maintenance + quality sessions by role
DROP FUNCTION IF EXISTS public.open_my_work_session();

CREATE OR REPLACE FUNCTION public.open_my_work_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx record;
  v_today date := (now() AT TIME ZONE 'Africa/Algiers')::date;
  v_session_id uuid;
  v_shift_type public.shift_type;
  v_lid uuid;
  v_result jsonb := jsonb_build_object('maintenance', NULL, 'quality', NULL);
BEGIN
  IF v_uid IS NULL THEN RETURN v_result; END IF;

  -- ============ MAINTENANCE ============
  IF public.has_role(v_uid, 'maintenancier') THEN
    SELECT * INTO v_ctx FROM public.get_scope_shift_context(v_uid, 'maintenance', now()) LIMIT 1;
    IF v_ctx.team_id IS NOT NULL AND (v_ctx.is_on_shift OR v_ctx.autorisation_libre) THEN
      -- anti-duplicate
      SELECT id INTO v_session_id
      FROM public.maintenance_shifts
      WHERE maintenancier_id = v_uid AND is_active = true
      LIMIT 1;
      IF v_session_id IS NULL THEN
        v_shift_type := CASE v_ctx.template_code
          WHEN 'matin' THEN 'matin'::public.shift_type
          WHEN 'soir' THEN 'apres_midi'::public.shift_type
          WHEN 'midi' THEN 'apres_midi'::public.shift_type
          WHEN 'nuit' THEN 'nuit'::public.shift_type
          ELSE 'matin'::public.shift_type
        END;
        INSERT INTO public.maintenance_shifts (
          maintenancier_id, shift_type, date_shift, shift_team_id, line_ids,
          heure_debut, heure_fin, is_active, observations, opened_by
        ) VALUES (
          v_uid, v_shift_type, v_today, v_ctx.team_id, COALESCE(v_ctx.line_ids, '{}'),
          v_ctx.heure_debut, v_ctx.heure_fin, true,
          '[Ouverture auto rotation équipe]', v_uid
        )
        RETURNING id INTO v_session_id;

        INSERT INTO public.audit_logs (action, action_label, description, user_id, entity_type, entity_id)
        VALUES (
          'shift_auto_open', 'Ouverture auto session',
          'Session maintenance ouverte automatiquement via rotation équipe (' || COALESCE(v_ctx.template_code, '?') || ')',
          v_uid, 'maintenance_shift', v_session_id
        );
      END IF;
      v_result := jsonb_set(v_result, '{maintenance}', to_jsonb(v_session_id));
    END IF;
  END IF;

  -- ============ QUALITY ============
  IF public.has_role(v_uid, 'controleur_qualite') THEN
    SELECT * INTO v_ctx FROM public.get_scope_shift_context(v_uid, 'quality', now()) LIMIT 1;
    IF v_ctx.team_id IS NOT NULL AND (v_ctx.is_on_shift OR v_ctx.autorisation_libre) THEN
      SELECT id INTO v_session_id
      FROM public.quality_shifts
      WHERE controller_id = v_uid AND is_active = true
      LIMIT 1;
      IF v_session_id IS NULL THEN
        v_shift_type := CASE v_ctx.template_code
          WHEN 'matin' THEN 'matin'::public.shift_type
          WHEN 'soir' THEN 'apres_midi'::public.shift_type
          WHEN 'midi' THEN 'apres_midi'::public.shift_type
          WHEN 'nuit' THEN 'nuit'::public.shift_type
          ELSE 'matin'::public.shift_type
        END;
        INSERT INTO public.quality_shifts (
          controller_id, shift_type, date_shift, shift_team_id,
          heure_debut, heure_fin, is_active, observations, opened_by
        ) VALUES (
          v_uid, v_shift_type, v_today, v_ctx.team_id,
          v_ctx.heure_debut, v_ctx.heure_fin, true,
          '[Ouverture auto rotation équipe]', v_uid
        )
        RETURNING id INTO v_session_id;

        -- attach scheduled lines
        IF v_ctx.line_ids IS NOT NULL THEN
          FOREACH v_lid IN ARRAY v_ctx.line_ids LOOP
            INSERT INTO public.quality_shift_lines (quality_shift_id, production_line_id)
            VALUES (v_session_id, v_lid)
            ON CONFLICT DO NOTHING;
          END LOOP;
        END IF;

        INSERT INTO public.audit_logs (action, action_label, description, user_id, entity_type, entity_id)
        VALUES (
          'shift_auto_open', 'Ouverture auto session',
          'Session qualité ouverte automatiquement via rotation équipe (' || COALESCE(v_ctx.template_code, '?') || ')',
          v_uid, 'quality_shift', v_session_id
        );
      END IF;
      v_result := jsonb_set(v_result, '{quality}', to_jsonb(v_session_id));
    END IF;
  END IF;

  RETURN v_result;
END;
$function$;