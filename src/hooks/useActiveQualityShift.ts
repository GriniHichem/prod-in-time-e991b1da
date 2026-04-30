import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ActiveQualityShift {
  id: string;
  date_shift: string;
  shift_type: string;
  shift_team_id: string | null;
  controller_id: string;
  heure_debut: string;
  heure_fin: string | null;
  is_active: boolean;
  observations: string | null;
  team?: { id: string; name: string; code: string; color: string | null } | null;
  lines: { id: string; code: string; designation: string }[];
  production_shift_ids: string[];
}

export function useActiveQualityShift() {
  const { user } = useAuth();
  const [shift, setShift] = useState<ActiveQualityShift | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setShift(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data: qs } = await supabase
      .from("quality_shifts" as any)
      .select("*, shift_teams(id, name, code, color)")
      .eq("controller_id", user.id)
      .eq("is_active", true)
      .eq("date_shift", today)
      .order("heure_debut", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!qs) {
      setShift(null);
      setLoading(false);
      return;
    }

    const qsAny = qs as any;
    const [linesRes, linksRes] = await Promise.all([
      supabase
        .from("quality_shift_lines" as any)
        .select("production_line_id, production_lines(id, code, designation)")
        .eq("quality_shift_id", qsAny.id),
      supabase
        .from("quality_shift_production_links" as any)
        .select("production_shift_id")
        .eq("quality_shift_id", qsAny.id),
    ]);

    const lines = ((linesRes.data as any[]) ?? [])
      .map((r) => r.production_lines)
      .filter(Boolean);
    const productionShiftIds = ((linksRes.data as any[]) ?? []).map((r) => r.production_shift_id);

    setShift({
      id: qsAny.id,
      date_shift: qsAny.date_shift,
      shift_type: qsAny.shift_type,
      shift_team_id: qsAny.shift_team_id,
      controller_id: qsAny.controller_id,
      heure_debut: qsAny.heure_debut,
      heure_fin: qsAny.heure_fin,
      is_active: qsAny.is_active,
      observations: qsAny.observations,
      team: qsAny.shift_teams ?? null,
      lines,
      production_shift_ids: productionShiftIds,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { shift, loading, refresh };
}

export function deriveShiftTypeFromHour(hour: number): "matin" | "apres_midi" | "nuit" {
  if (hour >= 5 && hour < 13) return "matin";
  if (hour >= 13 && hour < 21) return "apres_midi";
  return "nuit";
}
