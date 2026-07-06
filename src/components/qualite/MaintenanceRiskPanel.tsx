import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/responsive/ResponsiveDialog";
import { Wrench, ShieldAlert, Plus, ExternalLink, RefreshCw } from "lucide-react";
import { logAudit } from "@/lib/audit";

interface MaintCtxRow {
  kind: "ticket" | "preventive";
  id: string;
  numero: string | null;
  label: string;
  statut: string;
  priorite: string | null;
  machine_id: string | null;
  ligne_id: string | null;
}

interface Props {
  ofId: string;
  ofNumero?: string | null;
  lineId?: string | null;
}

/**
 * Shows maintenance risks (open tickets + active preventive plans) related to the
 * OF's line/machine, and lets quality staff declare a maintenance ticket from a
 * detected quality risk. Connects the quality shift to the maintenance shift.
 */
export function MaintenanceRiskPanel({ ofId, ofNumero, lineId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<MaintCtxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [machineId, setMachineId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [priorite, setPriorite] = useState("normale");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!ofId) return;
    setLoading(true);
    const [ctxRes, lineRes] = await Promise.all([
      (supabase as any).rpc("get_maintenance_context_for_of", { p_of_id: ofId }),
      lineId
        ? (supabase as any).from("production_lines").select("machine_id").eq("id", lineId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setRows(((ctxRes.data as any[]) ?? []) as MaintCtxRow[]);
    setMachineId((lineRes.data as any)?.machine_id ?? null);
    setLoading(false);
  }, [ofId, lineId]);

  useEffect(() => {
    load();
  }, [load]);

  const tickets = rows.filter((r) => r.kind === "ticket");
  const preventifs = rows.filter((r) => r.kind === "preventive");

  const handleCreateTicket = async () => {
    if (!description.trim()) {
      toast({ title: "Description requise", variant: "destructive" });
      return;
    }
    if (!machineId) {
      toast({ title: "Aucune machine liée à la ligne", description: "Impossible de créer le ticket automatiquement.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("tickets")
        .insert({
          machine_id: machineId,
          ligne_id: lineId ?? null,
          of_id: ofId,
          priorite: priorite as any,
          description: `[Risque qualité] ${description.trim()}`,
          declarant_id: user?.id,
          numero: "",
          is_from_gpao: false,
        } as any)
        .select("id, numero")
        .single();
      if (error) throw error;
      await logAudit({
        action_type: "create",
        module: "gmao" as any,
        entity_type: "ticket",
        entity_id: (data as any).id,
        action_label: "Ticket maintenance depuis risque qualité",
        new_values: { of_id: ofId, ligne_id: lineId, origine: "qualite" },
      });
      toast({ title: "Ticket créé", description: `Lié à l'OF ${ofNumero ?? ""}` });
      setOpen(false);
      setDescription("");
      setPriorite("normale");
      await load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" /> Risques &amp; maintenance
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Déclarer un ticket
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1.5">
            <Wrench className="h-3.5 w-3.5" /> Tickets ouverts ({tickets.length})
          </div>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun ticket maintenance ouvert sur cette ligne.</p>
          ) : (
            <div className="space-y-1.5">
              {tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-sm border rounded-md px-2.5 py-1.5">
                  <div className="min-w-0">
                    <span className="font-medium">{t.numero || t.id.slice(0, 6)}</span>
                    <span className="text-muted-foreground truncate ml-2">{t.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.priorite && <Badge variant="outline" className="text-[10px]">{t.priorite}</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{t.statut}</Badge>
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                      <Link to={`/tickets/${t.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Préventifs actifs ({preventifs.length})
          </div>
          {preventifs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun plan préventif actif sur cet équipement.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {preventifs.map((p) => (
                <Badge key={p.id} variant="outline" className="py-1">
                  <Link to={`/preventif/${p.id}`} className="hover:underline">{p.numero || ""} {p.label}</Link>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Déclarer un ticket maintenance"
        description={`Risque qualité constaté sur l'OF ${ofNumero ?? ""}. Le ticket sera lié à l'OF et à la ligne.`}
      >
        <div className="space-y-4">
          <div>
            <Label>Priorité</Label>
            <Select value={priorite} onValueChange={setPriorite}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="basse">Basse</SelectItem>
                <SelectItem value="normale">Normale</SelectItem>
                <SelectItem value="haute">Haute</SelectItem>
                <SelectItem value="critique">Critique</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description du risque *</Label>
            <Textarea
              className="mt-1"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez le problème constaté (dérive machine, fuite, non-conformité récurrente...)"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Annuler</Button>
            <Button onClick={handleCreateTicket} disabled={submitting}>
              <Plus className="h-4 w-4 mr-1" /> {submitting ? "Création..." : "Créer le ticket"}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </Card>
  );
}
