import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit2, Archive, Trash2 } from "lucide-react";
import {
  usePdrPositions, createPosition, updatePosition, softDeletePosition, hardDeletePosition,
  type PdrInstallPosition, type LifespanMode, type ProductionRule,
} from "@/hooks/usePdrPositions";

interface Props {
  linkId: string;
  pdrLabel?: string;
  canEdit?: boolean;
}

const LIFESPAN_LABELS: Record<LifespanMode, string> = {
  time: "Par temps (jours)",
  production: "Par production",
  mixte: "Mixte (temps + production)",
  none: "Aucune",
};

const PROD_RULE_LABELS: Record<ProductionRule, string> = {
  complete: "Production complète",
  reparti: "Répartie équitablement",
  coefficient: "Coefficient personnalisé",
  manuel: "Saisie manuelle",
};

const NIVEAU_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  vert: "secondary",
  orange: "default",
  rouge: "destructive",
};

export function PdrPositionsManager({ linkId, pdrLabel, canEdit = true }: Props) {
  const { positions, statuses, loading, reload } = usePdrPositions(linkId);
  const [editing, setEditing] = useState<Partial<PdrInstallPosition> | null>(null);
  const [open, setOpen] = useState(false);

  const statusFor = (id: string) => statuses.find((s) => s.position_id === id);

  const openNew = () => {
    setEditing({
      link_id: linkId,
      designation: "",
      position_index: (positions.at(-1)?.position_index ?? 0) + 1,
      statut: "active",
      lifespan_mode: "time",
      seuil_alerte_pct: 80,
      production_coefficient: 1,
      compteur_manuel: 0,
    });
    setOpen(true);
  };

  const openEdit = (p: PdrInstallPosition) => { setEditing(p); setOpen(true); };

  const save = async () => {
    if (!editing) return;
    if (!editing.designation || editing.designation.trim().length === 0) {
      toast({ title: "Désignation requise", variant: "destructive" }); return;
    }
    if ((editing.lifespan_mode === "production" || editing.lifespan_mode === "mixte") && !editing.production_rule) {
      toast({ title: "Règle de calcul requise pour ce mode", variant: "destructive" }); return;
    }
    if (editing.seuil_min != null && editing.seuil_max != null && editing.seuil_min > editing.seuil_max) {
      toast({ title: "seuil_min doit être ≤ seuil_max", variant: "destructive" }); return;
    }
    const res = editing.id
      ? await updatePosition(editing.id, editing)
      : await createPosition(editing as any);
    if ((res as any).error) {
      toast({ title: "Erreur", description: (res as any).error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing.id ? "Position modifiée" : "Position ajoutée" });
    setOpen(false); setEditing(null); reload();
  };

  const archive = async (p: PdrInstallPosition) => {
    if (!confirm(`Désactiver la position « ${p.designation} » ?`)) return;
    await softDeletePosition(p.id);
    toast({ title: "Position désactivée (suppression logique)" });
    reload();
  };

  const remove = async (p: PdrInstallPosition) => {
    if (!confirm(`Supprimer définitivement la position « ${p.designation} » ? (impossible si historique)`)) return;
    const res = await hardDeletePosition(p.id);
    if ((res as any).error) {
      toast({ title: "Suppression bloquée", description: (res as any).error.message, variant: "destructive" });
    } else {
      toast({ title: "Position supprimée" });
    }
    reload();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {pdrLabel && <span className="font-medium">{pdrLabel} — </span>}
          {positions.filter((p) => p.statut !== "supprimee").length} position(s)
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Ajouter une position</Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Désignation</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Compteur</TableHead>
            <TableHead>Niveau</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Chargement...</TableCell></TableRow>
          ) : positions.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Aucune position définie</TableCell></TableRow>
          ) : positions.map((p) => {
            const st = statusFor(p.id);
            return (
              <TableRow key={p.id} className={p.statut === "supprimee" ? "opacity-50" : ""}>
                <TableCell className="tabular-nums">{p.position_index}</TableCell>
                <TableCell>
                  <div className="font-medium">{p.designation}</div>
                  {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant={p.statut === "active" ? "default" : "outline"} className="text-xs">{p.statut}</Badge>
                </TableCell>
                <TableCell className="text-xs">{LIFESPAN_LABELS[p.lifespan_mode]}</TableCell>
                <TableCell className="text-xs tabular-nums">
                  {st ? (
                    <>
                      {st.compteur_actuel.toFixed(1)}
                      {st.compteur_max ? ` / ${st.compteur_max}` : ""} {p.unite_mesure || ""}
                      {st.compteur_max ? <div className="text-muted-foreground">{st.pct_consomme.toFixed(0)}%</div> : null}
                    </>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  {st && st.compteur_max ? (
                    <Badge variant={NIVEAU_VARIANT[st.niveau]} className="text-xs">{st.niveau}</Badge>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      {p.statut !== "supprimee" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => archive(p)} title="Désactiver">
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(p)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Modifier la position" : "Nouvelle position"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ordre</Label>
                  <Input type="number" value={editing.position_index ?? 1}
                    onChange={(e) => setEditing({ ...editing, position_index: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Statut</Label>
                  <Select value={editing.statut || "active"} onValueChange={(v) => setEditing({ ...editing, statut: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="supprimee">Supprimée</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Désignation *</Label>
                <Input value={editing.designation || ""}
                  onChange={(e) => setEditing({ ...editing, designation: e.target.value })}
                  placeholder="ex. Robinet voie 1" />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea value={editing.description || ""} rows={2}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>

              <div>
                <Label>Mode de durée de vie</Label>
                <Select value={editing.lifespan_mode || "time"}
                  onValueChange={(v) => setEditing({ ...editing, lifespan_mode: v as LifespanMode })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LIFESPAN_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(editing.lifespan_mode === "production" || editing.lifespan_mode === "mixte") && (
                <div>
                  <Label>Règle de calcul *</Label>
                  <Select value={editing.production_rule || ""}
                    onValueChange={(v) => setEditing({ ...editing, production_rule: v as ProductionRule })}>
                    <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROD_RULE_LABELS).map(([k, l]) => (
                        <SelectItem key={k} value={k}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editing.production_rule === "coefficient" && (
                <div>
                  <Label>Coefficient</Label>
                  <Input type="number" step="0.01" value={editing.production_coefficient ?? 1}
                    onChange={(e) => setEditing({ ...editing, production_coefficient: Number(e.target.value) })} />
                </div>
              )}

              {editing.production_rule === "manuel" && (
                <div>
                  <Label>Compteur manuel</Label>
                  <Input type="number" min={0} value={editing.compteur_manuel ?? 0}
                    onChange={(e) => setEditing({ ...editing, compteur_manuel: Number(e.target.value) })} />
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Seuil min</Label>
                  <Input type="number" min={0} value={editing.seuil_min ?? ""}
                    onChange={(e) => setEditing({ ...editing, seuil_min: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Seuil max</Label>
                  <Input type="number" min={0} value={editing.seuil_max ?? ""}
                    onChange={(e) => setEditing({ ...editing, seuil_max: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Alerte %</Label>
                  <Input type="number" min={0} max={100} value={editing.seuil_alerte_pct ?? 80}
                    onChange={(e) => setEditing({ ...editing, seuil_alerte_pct: Number(e.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Unité</Label>
                  <Input value={editing.unite_mesure || ""} placeholder="h, jours, unités..."
                    onChange={(e) => setEditing({ ...editing, unite_mesure: e.target.value })} />
                </div>
                <div>
                  <Label>Marker X (%)</Label>
                  <Input type="number" min={0} max={100} value={editing.marker_x ?? ""}
                    onChange={(e) => setEditing({ ...editing, marker_x: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Marker Y (%)</Label>
                  <Input type="number" min={0} max={100} value={editing.marker_y ?? ""}
                    onChange={(e) => setEditing({ ...editing, marker_y: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={save}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
