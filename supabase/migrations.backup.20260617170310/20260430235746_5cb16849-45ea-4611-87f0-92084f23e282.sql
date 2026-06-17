-- Seed role_permissions for the new "inventaire" module
INSERT INTO public.role_permissions (role, module, can_view, can_create, can_edit, can_delete)
VALUES
  ('admin'::app_role,                  'inventaire', true, true, true, true),
  ('responsable_inventaire'::app_role, 'inventaire', true, true, true, true),
  ('agent_inventaire'::app_role,       'inventaire', true, true, false, false)
ON CONFLICT (role, module) DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete;