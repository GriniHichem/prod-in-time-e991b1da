
-- Fix overly permissive RLS on tickets
DROP POLICY IF EXISTS "Anyone authenticated can create tickets" ON public.tickets;
DROP POLICY IF EXISTS "Maintenance can update tickets" ON public.tickets;

-- More restrictive: only authenticated users can create tickets (with their own declarant_id)
CREATE POLICY "Authenticated can create tickets"
  ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = declarant_id);

-- Update: maintenance roles + the declarant can update
CREATE POLICY "Authorized users can update tickets"
  ON public.tickets FOR UPDATE TO authenticated
  USING (
    auth.uid() = declarant_id
    OR auth.uid() = assignee_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'resp_maintenance')
    OR public.has_role(auth.uid(), 'maintenancier')
  );

-- Delete only admins
CREATE POLICY "Admins can delete tickets"
  ON public.tickets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
