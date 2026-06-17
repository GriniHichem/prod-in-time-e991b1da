
-- Document categories table
CREATE TABLE public.document_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.document_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Document categories viewable by authenticated"
  ON public.document_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage document categories"
  ON public.document_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Entity documents table
CREATE TABLE public.entity_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  category_id UUID NOT NULL REFERENCES public.document_categories(id),
  file_name TEXT NOT NULL DEFAULT '',
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_type TEXT DEFAULT '',
  description TEXT DEFAULT '',
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.entity_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity documents viewable by authenticated"
  ON public.entity_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert entity documents"
  ON public.entity_documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Admin/maintenance/production can update entity documents"
  ON public.entity_documents FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'resp_maintenance'::app_role) OR
    has_role(auth.uid(), 'resp_production'::app_role) OR
    uploaded_by = auth.uid()
  );

CREATE POLICY "Admin/maintenance/production can delete entity documents"
  ON public.entity_documents FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'resp_maintenance'::app_role) OR
    has_role(auth.uid(), 'resp_production'::app_role) OR
    uploaded_by = auth.uid()
  );

-- Seed default categories
INSERT INTO public.document_categories (name, description, sort_order) VALUES
  ('Fiche technique', 'Documentation technique du produit ou équipement', 1),
  ('Fiche produit', 'Fiche descriptive du produit', 2),
  ('Notice d''utilisation', 'Manuel ou notice d''utilisation', 3),
  ('Certificat', 'Certificats de conformité, qualité, etc.', 4),
  ('Plan / Schéma', 'Plans techniques, schémas électriques, etc.', 5),
  ('Procédure', 'Procédures opérationnelles ou de maintenance', 6),
  ('Document qualité', 'Documents liés à la qualité', 7),
  ('Document fournisseur', 'Documents provenant du fournisseur', 8);

-- Create storage bucket for entity documents
INSERT INTO storage.buckets (id, name, public) VALUES ('entity-documents', 'entity-documents', true);

-- Storage RLS
CREATE POLICY "Authenticated can upload entity documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'entity-documents');

CREATE POLICY "Anyone can view entity documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'entity-documents');

CREATE POLICY "Owner can delete entity documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'entity-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role)));
