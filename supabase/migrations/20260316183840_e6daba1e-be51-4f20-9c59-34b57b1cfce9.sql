
-- 1. Référentiel des équipes (Shift A, B, C, D)
CREATE TABLE public.shift_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#3b82f6',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shift teams viewable by authenticated" ON public.shift_teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/prod can manage shift teams" ON public.shift_teams FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'resp_production'::app_role));

-- 2. Créneaux horaires paramétrables
CREATE TABLE public.shift_time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  code text NOT NULL UNIQUE,
  heure_debut time NOT NULL,
  heure_fin time NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_time_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Time slots viewable by authenticated" ON public.shift_time_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage time slots" ON public.shift_time_slots FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'resp_production'::app_role));

-- 3. Planning de rotation des équipes
CREATE TABLE public.shift_rotation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_team_id uuid NOT NULL REFERENCES public.shift_teams(id) ON DELETE CASCADE,
  date_shift date NOT NULL,
  time_slot_id uuid REFERENCES public.shift_time_slots(id),
  is_repos boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shift_team_id, date_shift)
);

ALTER TABLE public.shift_rotation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rotation viewable by authenticated" ON public.shift_rotation FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/prod can manage rotation" ON public.shift_rotation FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'resp_production'::app_role));

-- 4. Paramètres globaux shifts (tolérance, etc.)
CREATE TABLE public.shift_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings viewable by authenticated" ON public.shift_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage settings" ON public.shift_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Ajouter colonnes à la table shifts existante
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS shift_team_id uuid REFERENCES public.shift_teams(id),
  ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'en_cours',
  ADD COLUMN IF NOT EXISTS observations text DEFAULT '',
  ADD COLUMN IF NOT EXISTS heure_debut_reelle timestamptz,
  ADD COLUMN IF NOT EXISTS heure_fin_reelle timestamptz;

-- 6. Données initiales équipes
INSERT INTO public.shift_teams (name, code, color) VALUES
  ('Équipe A', 'A', '#3b82f6'),
  ('Équipe B', 'B', '#10b981'),
  ('Équipe C', 'C', '#f59e0b'),
  ('Équipe D', 'D', '#ef4444');

-- 7. Créneaux horaires standards
INSERT INTO public.shift_time_slots (label, code, heure_debut, heure_fin, sort_order) VALUES
  ('Matin', 'matin', '06:00', '14:00', 1),
  ('Après-midi', 'apres_midi', '14:00', '22:00', 2),
  ('Nuit', 'nuit', '22:00', '06:00', 3);

-- 8. Paramètres par défaut
INSERT INTO public.shift_settings (key, value, label, description) VALUES
  ('tolerance_saisie_heures', '1', 'Tolérance de saisie (heures)', 'Nombre d''heures de tolérance pour la déclaration horaire'),
  ('shifts_actifs_par_jour', '3', 'Shifts actifs par jour', 'Nombre d''équipes qui travaillent par jour'),
  ('total_equipes', '4', 'Total équipes', 'Nombre total d''équipes dans la rotation');

-- 9. Triggers updated_at
CREATE TRIGGER update_shift_teams_updated_at BEFORE UPDATE ON public.shift_teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shift_time_slots_updated_at BEFORE UPDATE ON public.shift_time_slots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shift_settings_updated_at BEFORE UPDATE ON public.shift_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
