import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Wrench, AlertTriangle, CalendarCheck, Factory } from "lucide-react";

interface GroupedTask {
  line: { id: string; code: string; designation: string } | null;
  machines: {
    machine: { id: string; code: string; designation: string };
    plans: any[];
    tickets: any[];
  }[];
}

export default function MaintenancierShiftView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupedTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadShiftTasks();
  }, [user]);

  const loadShiftTasks = async () => {
    if (!user) return;
    setLoading(true);

    // Get plans assigned to this user that are validated
    const { data: assignedPlanIds } = await supabase
      .from("preventive_plan_assignees")
      .select("plan_id")
      .eq("user_id", user.id);

    const planIds = (assignedPlanIds || []).map((a: any) => a.plan_id);

    let plans: any[] = [];
    if (planIds.length > 0) {
      const { data } = await supabase
        .from("preventive_plans")
        .select("*, machines(id, code, designation), production_lines(id, code, designation)")
        .in("id", planIds)
        .eq("statut_plan", "valide")
        .eq("is_active", true);
      plans = data || [];
    }

    // Get open tickets assigned to the user or unassigned
    const { data: tickets } = await supabase
      .from("tickets")
      .select("*, machines(id, code, designation), production_lines(id, code, designation)")
      .in("statut", ["ouvert", "pris_en_charge"])
      .or(`assignee_id.eq.${user.id},assignee_id.is.null`);

    // Group by line then machine
    const lineMap = new Map<string, GroupedTask>();

    const addToGroup = (lineInfo: any, machineInfo: any, item: any, type: "plan" | "ticket") => {
      const lineKey = lineInfo?.id || "__no_line__";
      if (!lineMap.has(lineKey)) {
        lineMap.set(lineKey, {
          line: lineInfo ? { id: lineInfo.id, code: lineInfo.code, designation: lineInfo.designation } : null,
          machines: [],
        });
      }
      const group = lineMap.get(lineKey)!;
      let machineGroup = group.machines.find(m => m.machine.id === machineInfo.id);
      if (!machineGroup) {
        machineGroup = { machine: { id: machineInfo.id, code: machineInfo.code, designation: machineInfo.designation }, plans: [], tickets: [] };
        group.machines.push(machineGroup);
      }
      if (type === "plan") machineGroup.plans.push(item);
      else machineGroup.tickets.push(item);
    };

    for (const p of plans) {
      if (p.machines) addToGroup((p as any).production_lines, p.machines, p, "plan");
    }
    for (const t of (tickets || [])) {
      if (t.machines) addToGroup(t.production_lines, t.machines, t, "ticket");
    }

    setGroups(Array.from(lineMap.values()).sort((a, b) => (a.line?.code || "zzz").localeCompare(b.line?.code || "zzz")));
    setLoading(false);
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement...</div>;

  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mon Shift</h1>
        <p className="text-muted-foreground capitalize">{today}</p>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Aucune tâche pour ce shift</p>
            <p className="text-sm">Pas de plans préventifs ni de tickets assignés.</p>
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <Collapsible key={group.line?.id || "__no_line__"} defaultOpen>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="flex flex-row items-center gap-3 py-3 cursor-pointer hover:bg-muted/30">
                  <Factory className="h-5 w-5 text-muted-foreground shrink-0" />
                  <CardTitle className="text-base flex-1 text-left">
                    {group.line ? `${group.line.code} — ${group.line.designation}` : "Sans ligne"}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {group.machines.reduce((s, m) => s + m.plans.length + m.tickets.length, 0)} tâches
                  </Badge>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  {group.machines.map((mg) => (
                    <div key={mg.machine.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm font-medium">{mg.machine.code}</span>
                        <span className="text-sm text-muted-foreground">{mg.machine.designation}</span>
                      </div>
                      {mg.plans.map((p: any) => {
                        const isOverdue = p.prochaine_echeance && new Date(p.prochaine_echeance) < new Date();
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted/50 ${isOverdue ? "bg-destructive/5" : "bg-muted/20"}`}
                            onClick={() => navigate(`/preventif/${p.id}`)}
                          >
                            <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
                            <span className="text-sm flex-1">{p.title}</span>
                            <Badge variant="outline" className="text-xs capitalize">{p.frequence}</Badge>
                            {isOverdue && <Badge variant="destructive" className="text-xs">Retard</Badge>}
                          </div>
                        );
                      })}
                      {mg.tickets.map((t: any) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted/50 bg-warning/5"
                          onClick={() => navigate(`/tickets/${t.id}`)}
                        >
                          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                          <span className="text-sm flex-1">{t.numero} — {t.description?.slice(0, 60)}</span>
                          <Badge variant={t.statut === "ouvert" ? "destructive" : "secondary"} className="text-xs capitalize">{t.statut.replace("_", " ")}</Badge>
                        </div>
                      ))}
                      {mg.plans.length === 0 && mg.tickets.length === 0 && (
                        <p className="text-xs text-muted-foreground pl-6">Aucune tâche</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))
      )}
    </div>
  );
}
