
-- Table for entity images (centralized for all modules)
CREATE TABLE IF NOT EXISTS public.entity_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  file_name TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_entity_images_lookup 
  ON public.entity_images (entity_type, entity_id);

-- Enable RLS
ALTER TABLE public.entity_images ENABLE ROW LEVEL SECURITY;

-- Everyone can view images
CREATE POLICY "Entity images viewable by authenticated"
  ON public.entity_images FOR SELECT TO authenticated
  USING (true);

-- Authenticated users can manage images (permission check done in app layer)
CREATE POLICY "Authenticated can insert entity images"
  ON public.entity_images FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Admin/maintenance/production can update entity images"
  ON public.entity_images FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'resp_maintenance'::app_role) OR
    has_role(auth.uid(), 'resp_production'::app_role) OR
    uploaded_by = auth.uid()
  );

CREATE POLICY "Admin/maintenance/production can delete entity images"
  ON public.entity_images FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'resp_maintenance'::app_role) OR
    has_role(auth.uid(), 'resp_production'::app_role) OR
    uploaded_by = auth.uid()
  );

-- Storage bucket for entity images
INSERT INTO storage.buckets (id, name, public)
VALUES ('entity-images', 'entity-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for entity-images bucket
CREATE POLICY "Entity images public read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'entity-images');

CREATE POLICY "Authenticated can upload entity images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'entity-images');

CREATE POLICY "Authenticated can update entity images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'entity-images');

CREATE POLICY "Authenticated can delete entity images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'entity-images');
