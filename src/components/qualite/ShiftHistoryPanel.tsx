import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";

interface Row {
  id: string;
  indicator_id: string;
  of_id: string | null;
  control_time: string;
  is_conform: boolean | null;
  controlled_by: string | null;
  unit: string | null;
  measured_value_numeric: number | null;
  measured_value_text: string | null;
  measured_value_boolean: boolean | null;
  selected_value: string | null;
  comment: string | null;
}

function displayValue(r: Row): string {
  if (r.measured_value_numeric !== null && r.measured_value_numeric !== undefined)
    return `${r.measured_value_numeric}${r.unit ? " " + r.unit : ""}`;
  if (r.selected_value) return r.selected_value;
  if (r.measured_value_text) return r.measured_value_text;
  if (r.measured_value_boolean !== null && r.measured_value_boolean !== undefined)
    return r.measured_value_boolean ? "Oui" : "Non";
  return "—";
}

export function ShiftHistoryPanel({
  qualityShiftId,
  filterOfId,
}: {
  qualityShiftId: string;
  filterOfId?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [indicators, setIndicators] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [ofNumbers, setOfNumbers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyOf, setOnlyOf] = useState(false);
  const [indicatorFilter, setIndicatorFilter] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("quality_checks")
      .select(
        "id, indicator_id, of_id, control_time, is_conform, controlled_by, unit, measured_value_numeric, measured_value_text, measured_value_boolean, selected_value, comment"
      )
      .eq("quality_shift_id", qualityShiftId)
      .order("control_time", { ascending: false })
      .limit(500);
    const list: Row[] = data || [];
    setRows(list);

    const indIds = [...new Set(list.map((r) => r.indicator_id).filter(Boolean))];
    const userIds = [...new Set(list.map((r) => r.controlled_by).filter(Boolean))] as string[];
    const ofIds = [...new Set(list.map((r) => r.of_id).filter(Boolean))] as string[];
    const [indRes, profRes, ofRes] = await Promise.all([
      indIds.length ? (supabase as any).from("quality_indicators").select("id, name, code").in("id", indIds) : Promise.resolve({ data: [] }),
      userIds.length ? (supabase as any).from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
      ofIds.length ? (supabase as any).from("ordres_fabrication").select("id, numero").in("id", ofIds) : Promise.resolve({ data: [] }),
    ]);
    setIndicators(Object.fromEntries((indRes.data || []).map((i: any) => [i.id, i.name || i.code])));
    setProfiles(Object.fromEntries((profRes.data || []).map((p: any) => [p.id, p.full_name || "—"])));
    setOfNumbers(Object.fromEntries((ofRes.data || []).map((o: any) => [o.id, o.numero])));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualityShiftId]);

  const scoped = useMemo(
    () => rows.filter((r) => !(onlyOf && filterOfId) || r.of_id === filterOfId),
    [rows, onlyOf, filterOfId]
  );

  // Quick control chips: distinct indicators (with counts) within the current OF scope
  const controlChips = useMemo(() => {
    const counts = new Map<string, number>();
    scoped.forEach((r) => counts.set(r.indicator_id, (counts.get(r.indicator_id) || 0) + 1));
    return [...counts.entries()]
      .map(([id, count]) => ({ id, label: indicators[id] || "—", count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [scoped, indicators]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((r) => {
      if (indicatorFilter && r.indicator_id !== indicatorFilter) return false;
      if (!q) return true;
      const name = (indicators[r.indicator_id] || "").toLowerCase();
      const who = (profiles[r.controlled_by || ""] || "").toLowerCase();
      return name.includes(q) || who.includes(q);
    });
  }, [scoped, search, indicatorFilter, indicators, profiles]);

  return (
    <div className="space-y-4">
      {/* Barre de recherche */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterOfId && (
          <Button variant={onlyOf ? "default" : "outline"} size="sm" onClick={() => setOnlyOf((v) => !v)}>
            OF sélectionné
          </Button>
        )}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un contrôle ou un contrôleur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filtre rapide par contrôle */}
      {controlChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground mr-1">Filtre :</span>
          <button
            type="button"
            onClick={() => setIndicatorFilter("")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              indicatorFilter === ""
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            Tous <span className="tabular-nums opacity-80">{scoped.length}</span>
          </button>
          {controlChips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setIndicatorFilter((v) => (v === c.id ? "" : c.id))}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                indicatorFilter === c.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {c.label} <span className="tabular-nums opacity-80">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Liste des saisies */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
          <History className="h-8 w-8 opacity-40" />
          <p className="text-sm">Aucune saisie enregistrée pour ce shift.</p>
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-2">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex flex-col items-center justify-center min-w-[52px] text-center">
                <span className="text-sm font-semibold tabular-nums">
                  {new Date(r.control_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {r.of_id ? ofNumbers[r.of_id] || "" : ""}
                </span>
              </div>
              <div className="h-9 w-px bg-border" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{indicators[r.indicator_id] || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {profiles[r.controlled_by || ""] || "—"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-base font-bold tabular-nums">{displayValue(r)}</div>
              </div>
              <div className="shrink-0 w-[104px] flex justify-end">
                {r.is_conform === true ? (
                  <Badge variant="outline" className="border-success/40 text-success gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Conforme
                  </Badge>
                ) : r.is_conform === false ? (
                  <Badge variant="outline" className="border-destructive/40 text-destructive gap-1">
                    <XCircle className="h-3.5 w-3.5" /> Non conf.
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

