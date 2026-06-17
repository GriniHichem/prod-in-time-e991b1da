
-- Add bureau_methode to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bureau_methode';

-- Add analytiques module for all existing roles
INSERT INTO public.role_permissions (role, module, can_view, can_create, can_edit, can_delete) VALUES
('admin','analytiques',true,true,true,true),
('resp_maintenance','analytiques',true,false,false,false),
('maintenancier','analytiques',true,false,false,false),
('resp_production','analytiques',true,false,false,false),
('chef_ligne','analytiques',true,false,false,false),
('operateur','analytiques',false,false,false,false),
('gestionnaire_magasin','analytiques',false,false,false,false);
