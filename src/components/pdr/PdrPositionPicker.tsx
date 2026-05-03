import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEntityPrimaryImages } from "@/hooks/useEntityPrimaryImages";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileWarning, MapPin, ListChecks } from "lucide-react";
import type { PdrPositionStatus } from "@/hooks/usePdrPositions";

export interface PositionPickValue {
  position_id: string;
  designation: string;
  compteur_actuel: number;
  compteur_max: number | null;
  unite: string | null;
  niveau: "vert" | "orange" | "rouge";
}

interface Props {
  pdrId: string;
  machineId?: string | null;
  equipementId?: string | null;
  value?: PositionPickValue | null;
  onChange: (v: PositionPickValue | null) => void;
  onAvailabilityChange?: (hasPositions: boolean) => void;
  disabled?: boolean;
}

const NIVEAU_BADGE: Record<string, "default" | "secondary" | "destructive"> = {
  vert: "secondary", orange: "default", rouge: "destructive",
};

const NIVEAU_DOT: Record<string, string> = {
  vert: "fill-emerald-500 stroke-emerald-700",
  orange: "fill-amber-500 stroke-amber-700",
  rouge: "fill-red-500 stroke-red-700",
};

export function PdrPositionPicker({
  pdrId, machineId, equipementId, value, onChange, onAvailabilityChange, disabled,
}: Props) {
  const [linkId, setLinkId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<PdrPositionStatus[]>([]);
  const [lastChanges, setLastChanges] = useState<Record<string, { date: string | null; cause: string | null }>>({});
  const [loading, setLoading] = useState(false);

  const entityType = machineId ? "machine" : equipementId ? "equipement" : null;
  const entityId = machineId || equipementId || null;

  // Resolve pdr_entity_links id for this (pdr, asset)
  useEffect(() => {
    let alive = true;
    if (!pdrId || !entityType || !entityId) { setLinkId(null); return; }
    (async () => {
      const { data } = await (supabase.from("pdr_entity_links" as any) as any)
        .select("id")
        .eq("pdr_id", pdrId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .maybeSingle();
      if (alive) setLinkId((data as any)?.id ?? null);
    })();
    return () => { alive = false; };
  }, [pdrId, entityType, entityId]);

  // Load active position statuses + last change info
  useEffect(() => {
    let alive = true;
    if (!linkId) { setStatuses([]); setLastChanges({}); return; }
    setLoading(true);
    (async () => {
      const { data: stRows } = await (supabase.from("pdr_position_status" as any) as any)
        .select("*").eq("link_id", linkId);
      const active = ((stRows as any) || []).filter((s: any) => s.statut === "active");
      if (!alive) return;
      setStatuses(active);

      const positionIds = active.map((s: any) => s.position_id);
      if (positionIds.length === 0) { setLastChanges({}); setLoading(false); return; }
      const { data: ipRows } = await supabase
        .from("intervention_pdr" as any)
        .select("position_id, cause_remplacement, created_at")
        .in("position_id", positionIds)
        .order("created_at", { ascending: false });
      const map: Record<string, { date: string | null; cause: string | null }> = {};
      (ipRows as any[] | null)?.forEach((r) => {
        if (!map[r.position_id]) map[r.position_id] = { date: r.created_at, cause: r.cause_remplacement };
      });
      if (alive) { setLastChanges(map); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [linkId]);

  useEffect(() => {
    onAvailabilityChange?.(statuses.length > 0);
  }, [statuses.length, onAvailabilityChange]);

  const { primaryImages } = useEntityPrimaryImages(
    entityType ? [{ type: entityType as any, id: entityId! }] : [],
  );
  const imageUrl = entityId ? primaryImages.get(entityId) : null;

  const select = (s: PdrPositionStatus) => {
    onChange({
      position_id: s.position_id,
      designation: s.designation,
      compteur_actuel: s.compteur_actuel,
      compteur_max: s.compteur_max,
      unite: s.unite_mesure,
      niveau: s.niveau,
    });
  };

  if (!entityType || !entityId) return null;
  if (loading) return <div className="text-xs text-muted-foreground">Chargement positions…</div>;
  if (statuses.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border p-3 bg-muted/30">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        Position concernée *
      </div>

      <Tabs defaultValue="list">
        <TabsList className="h-9">
          <TabsTrigger value="list" className="text-xs"><ListChecks className="h-3 w-3 mr-1" />Liste</TabsTrigger>
          <TabsTrigger value="image" className="text-xs" disabled={!imageUrl}><MapPin className="h-3 w-3 mr-1" />Image</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-2 space-y-1.5">
          {statuses.map((s) => {
            const isSel = value?.position_id === s.position_id;
            const lc = lastChanges[s.position_id];
            const pct = Math.min(100, Math.round(s.pct_consomme));
            return (
              <button
                key={s.position_id}
                type="button"
                disabled={disabled}
                onClick={() => select(s)}
                className={`w-full text-left rounded-md border p-2.5 transition min-h-[64px] ${
                  isSel ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "hover:bg-accent"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{s.designation}</span>
                  {s.compteur_max ? (
                    <Badge variant={NIVEAU_BADGE[s.niveau]} className="text-[10px]">{s.niveau}</Badge>
                  ) : null}
                </div>
                {s.compteur_max ? (
                  <>
                    <Progress value={pct} className="h-1.5 mt-1.5" />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1 tabular-nums">
                      <span>{s.compteur_actuel.toFixed(1)} / {s.compteur_max} {s.unite_mesure || ""}</span>
                      <span>{pct}% consommé</span>
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Compteur actuel : {s.compteur_actuel.toFixed(1)} {s.unite_mesure || ""}
                  </div>
                )}
                {lc?.date && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Dernier changement : {new Date(lc.date).toLocaleDateString()}{lc.cause ? ` — ${lc.cause}` : ""}
                  </div>
                )}
                {s.niveau === "rouge" && (
                  <div className="text-[10px] text-destructive mt-0.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Durée max dépassée
                  </div>
                )}
                {s.niveau === "orange" && (
                  <div className="text-[10px] text-amber-700 dark:text-amber-500 mt-0.5 flex items-center gap-1">
                    <FileWarning className="h-3 w-3" /> Seuil d'alerte atteint
                  </div>
                )}
              </button>
            );
          })}
        </TabsContent>

        <TabsContent value="image" className="mt-2">
          {imageUrl && (
            <div className="relative w-full overflow-auto rounded-md border bg-background" style={{ touchAction: "pinch-zoom" }}>
              <img src={imageUrl} alt="Plan asset" className="block w-full h-auto select-none" />
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                {statuses
                  .filter((s) => s.position_id && (s as any).marker_x != null && (s as any).marker_y != null)
                  .map((s: any) => {
                    const isSel = value?.position_id === s.position_id;
                    return (
                      <g key={s.position_id} style={{ pointerEvents: "auto", cursor: disabled ? "default" : "pointer" }}
                         onClick={() => !disabled && select(s)}>
                        <circle cx={s.marker_x} cy={s.marker_y} r={isSel ? 2.4 : 1.8}
                                strokeWidth={0.4} className={NIVEAU_DOT[s.niveau]} />
                        <text x={s.marker_x} y={s.marker_y - 2.5} fontSize={1.6}
                              textAnchor="middle" className="fill-foreground font-medium select-none">
                          {s.designation}
                        </text>
                      </g>
                    );
                  })}
              </svg>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1">Touchez un repère pour sélectionner. Utilisez la liste si l'image est difficile à viser.</div>
        </TabsContent>
      </Tabs>

      {value && (
        <div className="text-xs rounded bg-background border px-2 py-1.5 flex items-center justify-between">
          <span><span className="text-muted-foreground">Sélectionnée :</span> <span className="font-medium">{value.designation}</span></span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange(null)}>×</Button>
        </div>
      )}
    </div>
  );
}
