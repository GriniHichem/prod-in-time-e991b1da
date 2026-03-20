import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Edit, CheckCircle, PauseCircle, Play, CalendarCheck, Package, Users, Wrench } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUT_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  brouillon: { label: "Brouillon", variant: "secondary" },
  valide: { label: "Validé", variant: "default" },
  suspendu: { label: "Suspendu", variant: "outline" },
};

export default function PreventifDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const [plan, setPlan] = useState<any>(null);
  const [planPdr, setPlanPdr] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);

  const loadAll = async () => {
    if (!id) return;
    const [pRes, ppRes, aRes, eRes] = await Promise.all([
      supabase.from("preventive_plans").select("*, machines(code, designation), production_lines(code, designation)").eq("id", id).single(),
      supabase.from("preventive_plan_pdr").select("*, pdr(reference, designation)").eq("plan_id", id),
      supabase.from("preventive_plan_assignees").select("user_id").eq("plan_id", id),
      supabase.from("preventive_executions").select("*").eq("plan_id", id).order("date_execution", { ascending: false }),
    ]);
    if (pRes.data) setPlan(pRes.data);
    setPlanPdr(ppRes.data || []);
    setExecutions(eRes.data || []);

    // Load assignee profiles
    const userIds = (aRes.data || []).map((a: any) => a.user_id);
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds);
      setAssignees(profiles || []);
    }
  };

  useEffect(() => { loadAll(); }, [id]);

  const updateStatut = async (newStatut: string) => {
    await supabase.from("preventive_plans").update({ statut_plan: newStatut } as any).eq("id", id);
    toast({ title: `Plan ${newStatut === "valide" ? "validé" : newStatut === "suspendu" ? "suspendu" : "remis en brouillon"}` });
    loadAll();
  };

  if (!plan) return <div className="p-8 text-center text-muted-foreground">Chargement...</div>;

  const statutInfo = STATUT_LABELS[(plan as any).statut_plan] || STATUT_LABELS.valide;
  const isOverdue = plan.prochaine_echeance && new Date(plan.prochaine_echeance) < new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/preventif")} className="h-10 w-10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{plan.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={statutInfo.variant} className="text-xs">{statutInfo.label}</Badge>
            <Badge variant="outline" className="text-xs capitalize">{plan.frequence}</Badge>
            {isOverdue && <Badge variant="destructive" className="text-xs">En retard</Badge>}
            {(plan as any).source === "auto_duree_vie" && <Badge variant="secondary" className="text-xs">Auto (durée de vie)</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit("preventif") && (plan as any).statut_plan === "brouillon" && (
            <Button onClick={() => updateStatut("valide")} className="h-12 px-4">
              <CheckCircle className="h-4 w-4 mr-2" /> Valider
            </Button>
          )}
          {canEdit("preventif") && (plan as any).statut_plan === "valide" && (
            <Button variant="outline" onClick={() => updateStatut("suspendu")} className="h-12 px-4">
              <PauseCircle className="h-4 w-4 mr-2" /> Suspendre
            </Button>
          )}
          {canEdit("preventif") && (plan as any).statut_plan === "suspendu" && (
            <Button variant="outline" onClick={() => updateStatut("valide")} className="h-12 px-4">
              <Play className="h-4 w-4 mr-2" /> Réactiver
            </Button>
          )}
          {canEdit("preventif") && (
            <Button variant="outline" onClick={() => navigate(`/preventif/${id}/edit`)} className="h-12 px-4">
              <Edit className="h-4 w-4 mr-2" /> Modifier
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="h-11">
          <TabsTrigger value="info" className="h-9">Infos</TabsTrigger>
          <TabsTrigger value="pdr" className="h-9"><Package className="h-3.5 w-3.5 mr-1" />PDR</TabsTrigger>
          <TabsTrigger value="assignees" className="h-9"><Users className="h-3.5 w-3.5 mr-1" />Affectés</TabsTrigger>
          <TabsTrigger value="executions" className="h-9"><CalendarCheck className="h-3.5 w-3.5 mr-1" />Exécutions</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-6">
              {[
                ["Titre", plan.title],
                ["Machine", plan.machines ? `${plan.machines.code} — ${plan.machines.designation}` : "—"],
                ["Ligne", (plan as any).production_lines ? `${(plan as any).production_lines.code} — ${(plan as any).production_lines.designation}` : "—"],
                ["Fréquence", plan.frequence],
                ["Statut plan", statutInfo.label],
                ["Source", (plan as any).source === "auto_duree_vie" ? "Auto (durée de vie)" : "Manuel"],
                ["Dernière exécution", plan.derniere_execution ? new Date(plan.derniere_execution).toLocaleDateString("fr-FR") : "Jamais"],
                ["Prochaine échéance", plan.prochaine_echeance ? new Date(plan.prochaine_echeance).toLocaleDateString("fr-FR") : "—"],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium">{String(value)}</p>
                </div>
              ))}
              {(plan as any).type_maintenance && (
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground">Type de maintenance / Opérations</p>
                  <p className="text-sm whitespace-pre-wrap">{(plan as any).type_maintenance}</p>
                </div>
              )}
              {plan.description && (
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="text-sm">{plan.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdr">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Désignation</TableHead>
                    <TableHead>Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planPdr.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Aucune PDR</TableCell></TableRow>
                  ) : planPdr.map((pp: any) => (
                    <TableRow key={pp.id}>
                      <TableCell className="font-mono text-sm">{pp.pdr?.reference}</TableCell>
                      <TableCell>{pp.pdr?.designation}</TableCell>
                      <TableCell className="tabular-nums">×{pp.quantite}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignees">
          <Card>
            <CardContent className="pt-6">
              {assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucun maintenancier affecté</p>
              ) : (
                <div className="space-y-2">
                  {assignees.map((a: any) => (
                    <div key={a.user_id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{a.first_name} {a.last_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executions">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">Aucune exécution</TableCell></TableRow>
                  ) : executions.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="tabular-nums text-sm">{new Date(e.date_execution).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
