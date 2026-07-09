CREATE TABLE public.quality_shift_pins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quality_shift_id UUID NOT NULL REFERENCES public.quality_shifts(id) ON DELETE CASCADE,
  of_id UUID NOT NULL,
  indicator_id UUID NOT NULL,
  pinned_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (quality_shift_id, of_id, indicator_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_shift_pins TO authenticated;
GRANT ALL ON public.quality_shift_pins TO service_role;

ALTER TABLE public.quality_shift_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view quality shift pins"
ON public.quality_shift_pins FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert quality shift pins"
ON public.quality_shift_pins FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can delete quality shift pins"
ON public.quality_shift_pins FOR DELETE TO authenticated USING (true);