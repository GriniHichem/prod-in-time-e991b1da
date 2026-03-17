import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/gmao/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Clock, Cog, CalendarCheck, Wrench, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DateRangeFilter } from "@/components/analytics/DateRangeFilter";
import { KpiCardComparison } from "@/components/analytics/KpiCardComparison";
import { useDateFilter, filterByDateRange } from "@/hooks/useDateFilter";

export default function Dashboard() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [preventivePlans, setPreventivePlans] = useState<any[]>([]);
  const navigate = useNavigate();
  const df = useDateFilter("this_month");

  useEffect(() => {
    const loadData = async () => {
      const [ticketsRes, machinesRes, plansRes] = await Promise.all([
        supabase.from("tickets").select("*, machines(designation, code)").order("created_at", { ascending: false }),
        supabase.from("machines").select("*").eq("is_active", true),
        supabase.from("preventive_plans").select("*, machines(designation, code)").eq("is_active", true).order("prochaine_echeance", { ascending: true }).limit(5),
      ]);
      setTickets(ticketsRes.data || []);
      setMachines(machinesRes.data || []);
      setPreventivePlans(plansRes.data || []);
    };
    loadData();
  }, []);

  const fTickets = useMemo(() => filterByDateRange(tickets, df.range, (t) => t.heure_declaration || t.created_at), [tickets, df.range]);
  const cTickets = useMemo(() => df.compareRange ? filterByDateRange(tickets, df.compareRange, (t) => t.heure_declaration || t.created_at) : [], [tickets, df.compareRange]);

  const openTickets = fTickets.filter((t) => t.statut !== "cloture" && t.statut !== "resolu").length;
  const prevOpen = cTickets.filter((t) => t.statut !== "cloture" && t.statut !== "resolu").length;

  const machinesDown = machines.filter((m) => m.statut === "arret").length;
  const inMaintenance = machines.filter((m) => m.statut === "maintenance").length;

  const resolved = fTickets.filter((t) => t.temps_intervention_minutes);
  const avgMttr = resolved.length > 0 ? Math.round(resolved.reduce((s, t) => s + t.temps_intervention_minutes, 0) / resolved.length) : 0;
  const prevResolved = cTickets.filter((t) => t.temps_intervention_minutes);
  const prevMttr = prevResolved.length > 0 ? Math.round(prevResolved.reduce((s, t) => s + t.temps_intervention_minutes, 0) / prevResolved.length) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard GMAO</h1>
          <p className="text-muted-foreground text-sm">Vue d'ensemble de la maintenance</p>
        </div>
        <DateRangeFilter {...df} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCardComparison title="Tickets ouverts" value={openTickets} icon={AlertTriangle}
          subtitle={`${fTickets.length} total`} currentNumeric={openTickets} previousValue={df.compareEnabled ? prevOpen : undefined} invertTrend />
        <KpiCardComparison title="MTTR moyen" value={avgMttr ? `${avgMttr} min` : "—"} icon={Clock}
          subtitle="Temps moyen de réparation" currentNumeric={avgMttr} previousValue={df.compareEnabled ? prevMttr : undefined} unit=" min" invertTrend />
        <KpiCardComparison title="Machines en arrêt" value={machinesDown} icon={Cog}
          subtitle={`${inMaintenance} en maintenance`} />
        <KpiCardComparison title="Parc machines" value={machines.length} icon={TrendingUp} subtitle="Actives" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Tickets récents
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {fTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucun ticket</p>
            ) : (
              <div className="space-y-2">
                {fTickets.slice(0, 5).map((t) => (
                  <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}
                    className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.numero}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.machines?.designation || "Machine inconnue"}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge type="priority" value={t.priorite} />
                      <StatusBadge type="ticket" value={t.statut} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Préventif à venir
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {preventivePlans.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucun plan préventif</p>
            ) : (
              <div className="space-y-2">
                {preventivePlans.map((p) => {
                  const isOverdue = p.prochaine_echeance && new Date(p.prochaine_echeance) < new Date();
                  return (
                    <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg border ${isOverdue ? "border-destructive/30 bg-destructive/5" : ""}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.machines?.designation}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-medium tabular-nums ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                          {p.prochaine_echeance ? new Date(p.prochaine_echeance).toLocaleDateString("fr-FR") : "Non planifié"}
                        </p>
                        {isOverdue && <p className="text-[10px] text-destructive font-medium">EN RETARD</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {machinesDown > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-destructive" />
              Machines en arrêt
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {machines.filter((m) => m.statut === "arret").map((m) => (
                <div key={m.id} onClick={() => navigate(`/machines/${m.id}`)}
                  className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors">
                  <p className="text-sm font-medium">{m.code}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.designation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
