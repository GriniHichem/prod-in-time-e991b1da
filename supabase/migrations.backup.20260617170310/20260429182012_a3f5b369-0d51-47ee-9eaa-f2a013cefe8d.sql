
-- ============================================================
-- 1) CUSTOM ROLES (additif à l'enum app_role)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  color text DEFAULT '#64748b',
  inherits_from app_role,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_roles_admin_all" ON public.custom_roles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'responsable_si'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'responsable_si'::app_role));

CREATE POLICY "custom_roles_read_all" ON public.custom_roles
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_custom_roles_updated
  BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) QUALITY PERMISSIONS (granulaire par rôle)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quality_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL UNIQUE,
  can_create_check boolean NOT NULL DEFAULT false,
  can_validate_check boolean NOT NULL DEFAULT false,
  can_reject_check boolean NOT NULL DEFAULT false,
  can_create_nc boolean NOT NULL DEFAULT false,
  can_close_nc boolean NOT NULL DEFAULT false,
  can_decide_nc boolean NOT NULL DEFAULT false,
  can_create_action boolean NOT NULL DEFAULT false,
  can_verify_action boolean NOT NULL DEFAULT false,
  can_close_action boolean NOT NULL DEFAULT false,
  can_manage_indicators boolean NOT NULL DEFAULT false,
  can_manage_assignments boolean NOT NULL DEFAULT false,
  can_publish_recipe boolean NOT NULL DEFAULT false,
  can_publish_bom boolean NOT NULL DEFAULT false,
  can_export_tracability boolean NOT NULL DEFAULT false,
  can_view_reports boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quality_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quality_perms_admin_all" ON public.quality_permissions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'responsable_si'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'responsable_si'::app_role));

CREATE POLICY "quality_perms_read_all" ON public.quality_permissions
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_quality_perms_updated
  BEFORE UPDATE ON public.quality_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: admin et directeur_qualite reçoivent tous les droits, autres rôles à zéro
INSERT INTO public.quality_permissions (role,
  can_create_check, can_validate_check, can_reject_check,
  can_create_nc, can_close_nc, can_decide_nc,
  can_create_action, can_verify_action, can_close_action,
  can_manage_indicators, can_manage_assignments,
  can_publish_recipe, can_publish_bom,
  can_export_tracability, can_view_reports)
VALUES
  ('admin', true,true,true, true,true,true, true,true,true, true,true, true,true, true,true),
  ('directeur_qualite', true,true,true, true,true,true, true,true,true, true,true, true,true, true,true),
  ('responsable_controle_qualite', true,true,false, true,true,false, true,true,false, true,true, false,false, true,true),
  ('controleur_qualite', true,false,false, true,false,false, true,false,false, false,false, false,false, false,true)
ON CONFLICT (role) DO NOTHING;

-- ============================================================
-- 3) AUDIT ROLE SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_role_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  module text NOT NULL,
  audit_enabled boolean NOT NULL DEFAULT true,
  severity_threshold text NOT NULL DEFAULT 'info',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module)
);

ALTER TABLE public.audit_role_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_settings_admin_all" ON public.audit_role_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'responsable_si'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'responsable_si'::app_role));

CREATE POLICY "audit_settings_read_all" ON public.audit_role_settings
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_audit_settings_updated
  BEFORE UPDATE ON public.audit_role_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation du seuil
ALTER TABLE public.audit_role_settings
  ADD CONSTRAINT audit_settings_severity_check
  CHECK (severity_threshold IN ('info','warning','critical'));

-- ============================================================
-- 4) FONCTIONS HELPERS (security definer)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_quality_permission(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.quality_permissions qp ON qp.role = ur.role::text
    WHERE ur.user_id = _user_id
      AND CASE _action
        WHEN 'create_check' THEN qp.can_create_check
        WHEN 'validate_check' THEN qp.can_validate_check
        WHEN 'reject_check' THEN qp.can_reject_check
        WHEN 'create_nc' THEN qp.can_create_nc
        WHEN 'close_nc' THEN qp.can_close_nc
        WHEN 'decide_nc' THEN qp.can_decide_nc
        WHEN 'create_action' THEN qp.can_create_action
        WHEN 'verify_action' THEN qp.can_verify_action
        WHEN 'close_action' THEN qp.can_close_action
        WHEN 'manage_indicators' THEN qp.can_manage_indicators
        WHEN 'manage_assignments' THEN qp.can_manage_assignments
        WHEN 'publish_recipe' THEN qp.can_publish_recipe
        WHEN 'publish_bom' THEN qp.can_publish_bom
        WHEN 'export_tracability' THEN qp.can_export_tracability
        WHEN 'view_reports' THEN qp.can_view_reports
        ELSE false
      END
  )
$$;

CREATE OR REPLACE FUNCTION public.is_audit_enabled(_role text, _module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT audit_enabled FROM public.audit_role_settings
      WHERE role = _role AND module = _module LIMIT 1),
    true
  )
$$;

-- ============================================================
-- 5) APP SETTINGS — interrupteurs globaux (kill-switches)
-- ============================================================
INSERT INTO public.app_settings (key, value, label, description, is_secret) VALUES
  ('control.enforce_validations', 'true', 'Moteur de validations actif',
    'Active le moteur de validations bloquantes et a posteriori', false),
  ('control.enforce_notifications', 'true', 'Notifications actives',
    'Active l''envoi des notifications in-app et email', false),
  ('control.enforce_audit', 'true', 'Journal d''audit actif',
    'Active la journalisation des actions (à laisser ON en production)', false),
  ('control.enforce_rls_strict', 'true', 'Mode RLS strict',
    'Renforce les contrôles RLS sur les modules sensibles', false),
  ('control.allow_custom_roles', 'true', 'Rôles personnalisés autorisés',
    'Permet la création de rôles personnalisés', false),
  ('control.maintenance_mode', 'false', 'Mode maintenance',
    'Bloque les écritures pour tous sauf les administrateurs', false)
ON CONFLICT (key) DO NOTHING;
