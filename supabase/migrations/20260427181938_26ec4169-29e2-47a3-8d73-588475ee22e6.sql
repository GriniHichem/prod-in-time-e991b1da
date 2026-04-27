-- =========================================
-- ENUMS
-- =========================================
DO $$ BEGIN
  CREATE TYPE public.notification_severity AS ENUM ('info','low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_status AS ENUM ('unread','read','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_frequency AS ENUM ('immediate','grouped_hourly','grouped_daily');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================
-- TABLE: notifications
-- =========================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  notification_type text NOT NULL,
  module text NOT NULL,
  entity_type text,
  entity_id uuid,
  entity_code text,
  entity_label text,
  severity public.notification_severity NOT NULL DEFAULT 'info',
  status public.notification_status NOT NULL DEFAULT 'unread',
  recipient_user_id uuid,
  recipient_role text,
  triggered_by_user_id uuid,
  source text NOT NULL DEFAULT 'app',
  action_url text,
  metadata jsonb,
  read_at timestamptz,
  archived_at timestamptz,
  deduplication_key text,
  group_key text,
  rule_id uuid,
  is_critical boolean NOT NULL DEFAULT false,
  CONSTRAINT notifications_recipient_chk CHECK (recipient_user_id IS NOT NULL OR recipient_role IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user ON public.notifications(recipient_user_id) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role ON public.notifications(recipient_role) WHERE recipient_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_module ON public.notifications(module);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_severity ON public.notifications(severity);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON public.notifications(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_dedup ON public.notifications(deduplication_key) WHERE deduplication_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_has_role_text(_user_id uuid, _role_text text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role_text
  )
$$;

CREATE POLICY "Notifications: select own or by role"
ON public.notifications FOR SELECT TO authenticated
USING (
  recipient_user_id = auth.uid()
  OR (recipient_role IS NOT NULL AND public.user_has_role_text(auth.uid(), recipient_role))
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'responsable_si'::app_role)
);

CREATE POLICY "Notifications: insert by authenticated"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Notifications: update own or admin"
ON public.notifications FOR UPDATE TO authenticated
USING (
  recipient_user_id = auth.uid()
  OR (recipient_role IS NOT NULL AND public.user_has_role_text(auth.uid(), recipient_role))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Notifications: delete by admin"
ON public.notifications FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

-- =========================================
-- TABLE: notification_rules
-- =========================================
CREATE TABLE IF NOT EXISTS public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  description text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  module text NOT NULL,
  event_type text NOT NULL,
  severity public.notification_severity NOT NULL DEFAULT 'info',
  target_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_users jsonb DEFAULT '[]'::jsonb,
  excluded_users jsonb DEFAULT '[]'::jsonb,
  conditions jsonb,
  channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  frequency public.notification_frequency NOT NULL DEFAULT 'immediate',
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  is_critical boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_notif_rules_module_event ON public.notification_rules(module, event_type) WHERE is_active = true;

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_notification_rule(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'responsable_si'::app_role)
    OR (
      public.has_role(_user_id, 'resp_maintenance'::app_role)
      AND _module IN ('machines','equipements','organes','tickets','interventions','preventif','pdr','pdr_stock','lignes')
    )
    OR (
      public.has_role(_user_id, 'resp_production'::app_role)
      AND _module IN ('gpao','of','produits','articles','recettes','consommations','arrets')
    )
$$;

CREATE POLICY "Notif rules: select authenticated"
ON public.notification_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Notif rules: manage by authorized"
ON public.notification_rules FOR ALL TO authenticated
USING (public.can_manage_notification_rule(auth.uid(), module))
WITH CHECK (public.can_manage_notification_rule(auth.uid(), module));

DROP TRIGGER IF EXISTS trg_notif_rules_updated_at ON public.notification_rules;
CREATE TRIGGER trg_notif_rules_updated_at
BEFORE UPDATE ON public.notification_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- TABLE: user_notification_preferences
-- =========================================
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text,
  notification_type text,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean DEFAULT false,
  minimum_severity public.notification_severity NOT NULL DEFAULT 'info',
  muted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_user ON public.user_notification_preferences(user_id);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Prefs: select own or admin"
ON public.user_notification_preferences FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Prefs: insert own"
ON public.user_notification_preferences FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Prefs: update own"
ON public.user_notification_preferences FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Prefs: delete own"
ON public.user_notification_preferences FOR DELETE TO authenticated
USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_user_notif_prefs_updated_at ON public.user_notification_preferences;
CREATE TRIGGER trg_user_notif_prefs_updated_at
BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- Permissions: add 'notifications' module to role_permissions
-- (only for roles that exist)
-- =========================================
INSERT INTO public.role_permissions (role, module, can_view, can_create, can_edit, can_delete)
SELECT r::app_role, 'notifications', true, false, true, false
FROM unnest(ARRAY['admin','responsable_si','resp_maintenance','resp_production','maintenancier','chef_ligne','operateur','gestionnaire_magasin','bureau_methode','auditeur']::text[]) r
WHERE EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='app_role' AND e.enumlabel=r)
ON CONFLICT DO NOTHING;

-- Boost admin & responsable_si
UPDATE public.role_permissions
SET can_view = true, can_create = true, can_edit = true, can_delete = true
WHERE module = 'notifications' AND role::text IN ('admin','responsable_si');

-- =========================================
-- DEFAULT RULES (10 seeds)
-- =========================================
INSERT INTO public.notification_rules (name, description, module, event_type, severity, target_roles, channels, frequency, is_critical)
VALUES
  ('PDR en rupture', 'Stock PDR à zéro', 'pdr_stock', 'pdr_stock_out', 'critical',
    '["admin","resp_maintenance","gestionnaire_magasin"]'::jsonb, '["in_app"]'::jsonb, 'immediate', true),
  ('PDR stock critique', 'Stock PDR sous le seuil mini', 'pdr_stock', 'pdr_stock_critical', 'high',
    '["resp_maintenance","gestionnaire_magasin"]'::jsonb, '["in_app"]'::jsonb, 'grouped_hourly', false),
  ('Machine critique en panne', 'Machine de criticité élevée passée en panne', 'machines', 'machine_down', 'critical',
    '["admin","resp_maintenance","maintenancier"]'::jsonb, '["in_app"]'::jsonb, 'immediate', true),
  ('Ticket maintenance créé', 'Nouveau ticket maintenance', 'tickets', 'ticket_created', 'medium',
    '["resp_maintenance","maintenancier"]'::jsonb, '["in_app"]'::jsonb, 'immediate', false),
  ('Préventif en retard', 'Plan préventif dont l''échéance est dépassée', 'preventif', 'preventive_late', 'high',
    '["resp_maintenance","bureau_methode","maintenancier"]'::jsonb, '["in_app"]'::jsonb, 'grouped_daily', false),
  ('OF terminé', 'Ordre de fabrication clôturé', 'of', 'of_completed', 'info',
    '["resp_production","chef_ligne"]'::jsonb, '["in_app"]'::jsonb, 'immediate', false),
  ('Arrêt production long', 'Arrêt production supérieur à 30 minutes', 'arrets', 'production_stop_created', 'high',
    '["resp_production","resp_maintenance"]'::jsonb, '["in_app"]'::jsonb, 'immediate', false),
  ('Correction consommation', 'Correction d''une consommation enregistrée', 'consommations', 'consumption_correction', 'medium',
    '["resp_production","admin"]'::jsonb, '["in_app"]'::jsonb, 'immediate', false),
  ('Changement de rôle utilisateur', 'Modification des rôles d''un utilisateur', 'users', 'user_role_changed', 'critical',
    '["admin","responsable_si"]'::jsonb, '["in_app"]'::jsonb, 'immediate', true),
  ('Événement audit critique', 'Événement audit avec sévérité critique', 'audit', 'audit_critical_event', 'critical',
    '["admin","responsable_si","auditeur"]'::jsonb, '["in_app"]'::jsonb, 'immediate', true)
ON CONFLICT DO NOTHING;

-- Set conditions for stop ≥ 30 min
UPDATE public.notification_rules
SET conditions = '{"all":[{"field":"duration_minutes","op":"gte","value":30}]}'::jsonb
WHERE event_type = 'production_stop_created' AND conditions IS NULL;