import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LifespanMode = "time" | "production" | "mixte" | "none";
export type ProductionRule = "complete" | "reparti" | "coefficient" | "manuel";
export type PositionStatut = "active" | "inactive" | "supprimee";

export interface PdrInstallPosition {
  id: string;
  link_id: string;
  position_index: number;
  designation: string;
  description: string | null;
  marker_x: number | null;
  marker_y: number | null;
  statut: PositionStatut;
  lifespan_mode: LifespanMode;
  seuil_min: number | null;
  seuil_max: number | null;
  seuil_alerte_pct: number | null;
  unite_mesure: string | null;
  production_rule: ProductionRule | null;
  production_coefficient: number | null;
  compteur_manuel: number | null;
  created_at: string;
  updated_at: string;
}

export interface PdrPositionStatus {
  position_id: string;
  link_id: string;
  pdr_id: string;
  entity_type: string;
  entity_id: string;
  designation: string;
  statut: PositionStatut;
  lifespan_mode: LifespanMode;
  seuil_min: number | null;
  seuil_max: number | null;
  seuil_alerte_pct: number | null;
  unite_mesure: string | null;
  production_rule: ProductionRule | null;
  production_coefficient: number | null;
  current_instance_id: string | null;
  date_pose: string | null;
  date_dernier_changement: string | null;
  last_ticket_id: string | null;
  compteur_actuel: number;
  compteur_max: number | null;
  pct_consomme: number;
  compteur_restant: number | null;
  niveau: "vert" | "orange" | "rouge";
}

export function usePdrPositions(linkId?: string) {
  const [positions, setPositions] = useState<PdrInstallPosition[]>([]);
  const [statuses, setStatuses] = useState<PdrPositionStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!linkId) { setPositions([]); setStatuses([]); return; }
    setLoading(true);
    const [pRes, sRes] = await Promise.all([
      (supabase.from("pdr_install_positions" as any) as any)
        .select("*").eq("link_id", linkId).order("position_index"),
      (supabase.from("pdr_position_status" as any) as any)
        .select("*").eq("link_id", linkId),
    ]);
    setPositions((pRes.data as any) || []);
    setStatuses((sRes.data as any) || []);
    setLoading(false);
  }, [linkId]);

  useEffect(() => { reload(); }, [reload]);

  return { positions, statuses, loading, reload };
}

export async function createPosition(p: Partial<PdrInstallPosition> & { link_id: string; designation: string; position_index: number; }) {
  return (supabase.from("pdr_install_positions" as any) as any).insert(p as any);
}

export async function updatePosition(id: string, patch: Partial<PdrInstallPosition>) {
  return (supabase.from("pdr_install_positions" as any) as any).update(patch as any).eq("id", id);
}

export async function softDeletePosition(id: string) {
  return updatePosition(id, { statut: "supprimee" });
}

export async function hardDeletePosition(id: string) {
  return (supabase.from("pdr_install_positions" as any) as any).delete().eq("id", id);
}
