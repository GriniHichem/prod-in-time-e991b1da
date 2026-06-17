
-- Shift modes table
CREATE TABLE public.shift_modes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text DEFAULT '',
  nb_shifts integer NOT NULL DEFAULT 3,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_modes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shift modes viewable by authenticated" ON public.shift_modes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage shift modes" ON public.shift_modes FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'resp_production'::app_role));

-- Shift mode time slots
CREATE TABLE public.shift_mode_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_mode_id uuid NOT NULL REFERENCES public.shift_modes(id) ON DELETE CASCADE,
  label text NOT NULL,
  heure_debut time NOT NULL,
  heure_fin time NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_mode_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mode slots viewable by authenticated" ON public.shift_mode_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage mode slots" ON public.shift_mode_slots FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'resp_production'::app_role));

-- Add shift_mode_id to ordres_fabrication
ALTER TABLE public.ordres_fabrication ADD COLUMN IF NOT EXISTS shift_mode_id uuid REFERENCES public.shift_modes(id);

-- OF mode change history
CREATE TABLE public.of_mode_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  of_id uuid NOT NULL REFERENCES public.ordres_fabrication(id) ON DELETE CASCADE,
  old_mode_id uuid REFERENCES public.shift_modes(id),
  new_mode_id uuid NOT NULL REFERENCES public.shift_modes(id),
  changed_by uuid,
  reason text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.of_mode_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mode history viewable by authenticated" ON public.of_mode_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Prod can insert mode history" ON public.of_mode_history FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'resp_production'::app_role) OR has_role(auth.uid(), 'chef_ligne'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_shift_modes_updated_at BEFORE UPDATE ON public.shift_modes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed shift modes
INSERT INTO public.shift_modes (code, label, description, nb_shifts, is_default) VALUES
  ('3x8', '3 Shifts (24h)', 'Fonctionnement standard sur 24h avec 3 équipes', 3, true),
  ('2x8', '2 Shifts (16h)', 'Fonctionnement sur 16h avec 2 équipes', 2, false),
  ('1x8', '1 Shift (8h)', 'Fonctionnement sur 8h avec 1 équipe', 1, false),
  ('surface', 'Surface (8h-16h30)', 'Horaire fixe de 8h00 à 16h30', 1, false);

-- Seed time slots per mode
INSERT INTO public.shift_mode_slots (shift_mode_id, label, heure_debut, heure_fin, sort_order) VALUES
  ((SELECT id FROM public.shift_modes WHERE code = '3x8'), 'Matin', '06:00'::time, '14:00'::time, 1),
  ((SELECT id FROM public.shift_modes WHERE code = '3x8'), 'Après-midi', '14:00'::time, '22:00'::time, 2),
  ((SELECT id FROM public.shift_modes WHERE code = '3x8'), 'Nuit', '22:00'::time, '06:00'::time, 3),
  ((SELECT id FROM public.shift_modes WHERE code = '2x8'), 'Matin', '06:00'::time, '14:00'::time, 1),
  ((SELECT id FROM public.shift_modes WHERE code = '2x8'), 'Après-midi', '14:00'::time, '22:00'::time, 2),
  ((SELECT id FROM public.shift_modes WHERE code = '1x8'), 'Journée', '06:00'::time, '14:00'::time, 1),
  ((SELECT id FROM public.shift_modes WHERE code = 'surface'), 'Surface', '08:00'::time, '16:30'::time, 1);

-- Set default mode on existing OFs
UPDATE public.ordres_fabrication SET shift_mode_id = (SELECT id FROM public.shift_modes WHERE code = '3x8') WHERE shift_mode_id IS NULL;
