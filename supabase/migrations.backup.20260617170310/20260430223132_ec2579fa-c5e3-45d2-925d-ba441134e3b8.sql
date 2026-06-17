-- =====================================================================
-- Shift session notifications: open / close / force-close
-- Inserts directly into public.notifications using existing structure.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_shift_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kind text;
  v_module text;
  v_resp_role text;
  v_operator_id uuid;
  v_entity_label text;
  v_force_close boolean := false;
BEGIN
  -- Determine kind & roles by table
  IF TG_TABLE_NAME = 'shifts' THEN
    v_kind := 'production';
    v_module := 'gpao';
    v_resp_role := 'resp_production';
    v_operator_id := COALESCE(NEW.chef_ligne_id, OLD.chef_ligne_id);
  ELSIF TG_TABLE_NAME = 'maintenance_shifts' THEN
    v_kind := 'maintenance';
    v_module := 'interventions';
    v_resp_role := 'resp_maintenance';
    v_operator_id := COALESCE(NEW.maintenancier_id, OLD.maintenancier_id);
  ELSIF TG_TABLE_NAME = 'quality_shifts' THEN
    v_kind := 'quality';
    v_module := 'qualite';
    v_resp_role := 'responsable_controle_qualite';
    v_operator_id := COALESCE(NEW.controller_id, OLD.controller_id);
  ELSE
    RETURN NEW;
  END IF;

  v_entity_label := 'Shift ' || v_kind || ' du ' || COALESCE(NEW.date_shift, OLD.date_shift)::text;

  -- INSERT = opening
  IF TG_OP = 'INSERT' AND NEW.is_active = true THEN
    INSERT INTO public.notifications (
      title, message, notification_type, module, entity_type, entity_id, entity_label,
      severity, recipient_user_id, source, action_url, deduplication_key
    ) VALUES (
      'Session shift ouverte',
      'Votre session de shift ' || v_kind || ' a été ouverte par votre responsable.',
      'shift_opened', v_module, TG_TABLE_NAME, NEW.id, v_entity_label,
      'info'::notification_severity, v_operator_id, 'system',
      CASE v_kind
        WHEN 'production' THEN '/gpao/shift/live'
        WHEN 'maintenance' THEN '/maintenance/shift/live'
        ELSE '/qualite/shift/live'
      END,
      'shift_opened:' || NEW.id::text
    );
    RETURN NEW;
  END IF;

  -- UPDATE: detect closure
  IF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
    v_force_close := COALESCE(NEW.observations, '') LIKE '[Forcée par responsable]%';

    -- Notify responsables (by role)
    INSERT INTO public.notifications (
      title, message, notification_type, module, entity_type, entity_id, entity_label,
      severity, recipient_role, source, action_url, deduplication_key
    ) VALUES (
      CASE WHEN v_force_close THEN 'Shift clôturé (forcé)' ELSE 'Shift clôturé' END,
      'Une session de shift ' || v_kind || ' vient d''être clôturée.',
      CASE WHEN v_force_close THEN 'shift_force_closed' ELSE 'shift_closed' END,
      v_module, TG_TABLE_NAME, NEW.id, v_entity_label,
      CASE WHEN v_force_close THEN 'warning'::notification_severity ELSE 'info'::notification_severity END,
      v_resp_role, 'system',
      CASE v_kind
        WHEN 'production' THEN '/gpao/shift'
        WHEN 'maintenance' THEN '/maintenance/shift'
        ELSE '/qualite/shift'
      END,
      'shift_closed:' || NEW.id::text
    );

    -- Also notify operator when responsable forced the closure
    IF v_force_close AND v_operator_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        title, message, notification_type, module, entity_type, entity_id, entity_label,
        severity, recipient_user_id, source, action_url, deduplication_key
      ) VALUES (
        'Votre shift a été clôturé par le responsable',
        COALESCE(NEW.observations, 'Clôture forcée'),
        'shift_force_closed', v_module, TG_TABLE_NAME, NEW.id, v_entity_label,
        'warning'::notification_severity, v_operator_id, 'system',
        '/apps',
        'shift_force_closed_op:' || NEW.id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop & recreate triggers (idempotent)
DROP TRIGGER IF EXISTS shift_notify_event ON public.shifts;
CREATE TRIGGER shift_notify_event
AFTER INSERT OR UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.notify_shift_event();

DROP TRIGGER IF EXISTS maintenance_shift_notify_event ON public.maintenance_shifts;
CREATE TRIGGER maintenance_shift_notify_event
AFTER INSERT OR UPDATE ON public.maintenance_shifts
FOR EACH ROW EXECUTE FUNCTION public.notify_shift_event();

DROP TRIGGER IF EXISTS quality_shift_notify_event ON public.quality_shifts;
CREATE TRIGGER quality_shift_notify_event
AFTER INSERT OR UPDATE ON public.quality_shifts
FOR EACH ROW EXECUTE FUNCTION public.notify_shift_event();